"""
Deep Learning models for Water Demand prediction.

Trains MLP, LSTM, GRU, TCN on the same data splits as classical ML.
Uses sklearn preprocessing for fair comparison.
"""
import sys
import json
import time
import warnings
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
import torch
import torch.nn as nn
from torch.utils.data import Dataset, DataLoader
from sklearn.preprocessing import StandardScaler, OneHotEncoder
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score

sys.path.insert(0, str(Path(__file__).resolve().parent))
from config import (
    TARGET, SEED, MODELS_DIR, REPORTS_DIR, DATA_RAW, SPLIT_DATES
)
from feature_engineering import (
    load_raw, drop_leakage_and_identifiers, add_domain_features,
    chronological_split, get_feature_lists
)

warnings.filterwarnings("ignore")
np.random.seed(SEED)
torch.manual_seed(SEED)
if torch.cuda.is_available():
    torch.cuda.manual_seed_all(SEED)
    torch.backends.cudnn.deterministic = True
    torch.backends.cudnn.benchmark = False

DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")
print(f"Device: {DEVICE}")


# ── Data Preparation ─────────────────────────────────────────────────────────

class WaterDemandDataset(Dataset):
    """Flat feature dataset for MLP."""
    def __init__(self, X, y):
        self.X = torch.FloatTensor(X)
        self.y = torch.FloatTensor(y)

    def __len__(self):
        return len(self.y)

    def __getitem__(self, idx):
        return self.X[idx], self.y[idx]


class WaterDemandSequenceDataset(Dataset):
    """Sequence dataset for LSTM/GRU/TCN. Groups by development, creates 24h windows."""
    def __init__(self, X, y, dev_ids, seq_len=24):
        self.seq_len = seq_len
        self.sequences = []
        self.targets = []

        unique_devs = np.unique(dev_ids)
        for dev in unique_devs:
            mask = dev_ids == dev
            X_dev = X[mask]
            y_dev = y[mask]

            if len(X_dev) < seq_len:
                continue

            for i in range(len(X_dev) - seq_len + 1):
                self.sequences.append(X_dev[i:i+seq_len])
                self.targets.append(y_dev[i+seq_len-1])

        self.sequences = torch.FloatTensor(np.array(self.sequences))
        self.targets = torch.FloatTensor(np.array(self.targets))

    def __len__(self):
        return len(self.targets)

    def __getitem__(self, idx):
        return self.sequences[idx], self.targets[idx]


def prepare_data():
    """Load, engineer features, split, and encode."""
    df = load_raw()
    df["_dev_id"] = df["development_id"].values
    df = drop_leakage_and_identifiers(df)
    df = add_domain_features(df)

    splits = chronological_split(df)

    num_feats, cat_feats = get_feature_lists()
    available_num = [c for c in num_feats if c in splits["train"].columns]
    available_cat = [c for c in cat_feats if c in splits["train"].columns]

    # Encode categoricals with OneHotEncoder
    cat_encoder = OneHotEncoder(handle_unknown="ignore", sparse_output=False, max_categories=50)
    cat_encoder.fit(splits["train"][available_cat])

    num_scaler = StandardScaler()
    num_scaler.fit(splits["train"][available_num])

    data = {}
    for split_name, split_df in splits.items():
        X_num = num_scaler.transform(split_df[available_num].fillna(0))
        X_cat = cat_encoder.transform(split_df[available_cat].astype(str))
        X = np.hstack([X_num, X_cat]).astype(np.float32)
        y = split_df[TARGET].values.astype(np.float32)
        dev_ids = split_df["_dev_id"].values if "_dev_id" in split_df.columns else np.zeros(len(split_df))
        data[split_name] = {"X": X, "y": y, "dev_ids": dev_ids}

    n_features = data["train"]["X"].shape[1]

    return data, n_features, available_num, available_cat, num_scaler, cat_encoder


# ── Models ───────────────────────────────────────────────────────────────────

class MLP(nn.Module):
    def __init__(self, n_features, hidden_sizes=[256, 128, 64], dropout=0.2):
        super().__init__()
        layers = []
        prev = n_features
        for h in hidden_sizes:
            layers.extend([
                nn.Linear(prev, h),
                nn.BatchNorm1d(h),
                nn.ReLU(),
                nn.Dropout(dropout),
            ])
            prev = h
        layers.append(nn.Linear(prev, 1))
        self.net = nn.Sequential(*layers)

    def forward(self, x):
        return self.net(x).squeeze(-1)


class LSTMModel(nn.Module):
    def __init__(self, n_features, hidden_size=128, n_layers=2, dropout=0.2):
        super().__init__()
        self.lstm = nn.LSTM(n_features, hidden_size, n_layers,
                            batch_first=True, dropout=dropout if n_layers > 1 else 0)
        self.fc = nn.Sequential(
            nn.Linear(hidden_size, 64),
            nn.ReLU(),
            nn.Dropout(dropout),
            nn.Linear(64, 1)
        )

    def forward(self, x):
        lstm_out, _ = self.lstm(x)
        return self.fc(lstm_out[:, -1, :]).squeeze(-1)


class GRUModel(nn.Module):
    def __init__(self, n_features, hidden_size=128, n_layers=2, dropout=0.2):
        super().__init__()
        self.gru = nn.GRU(n_features, hidden_size, n_layers,
                          batch_first=True, dropout=dropout if n_layers > 1 else 0)
        self.fc = nn.Sequential(
            nn.Linear(hidden_size, 64),
            nn.ReLU(),
            nn.Dropout(dropout),
            nn.Linear(64, 1)
        )

    def forward(self, x):
        gru_out, _ = self.gru(x)
        return self.fc(gru_out[:, -1, :]).squeeze(-1)


class TCNBlock(nn.Module):
    def __init__(self, in_ch, out_ch, kernel_size, dropout):
        super().__init__()
        self.conv1 = nn.Conv1d(in_ch, out_ch, kernel_size, padding=kernel_size-1)
        self.conv2 = nn.Conv1d(out_ch, out_ch, kernel_size, padding=kernel_size-1)
        self.bn1 = nn.BatchNorm1d(out_ch)
        self.bn2 = nn.BatchNorm1d(out_ch)
        self.dropout = nn.Dropout(dropout)
        self.relu = nn.ReLU()
        self.downsample = nn.Conv1d(in_ch, out_ch, 1) if in_ch != out_ch else nn.Identity()

    def forward(self, x):
        residual = self.downsample(x)
        out = self.conv1(x)
        out = out[:, :, :x.size(2)]  # causal trim
        out = self.bn1(out)
        out = self.relu(out)
        out = self.dropout(out)
        out = self.conv2(out)
        out = out[:, :, :x.size(2)]  # causal trim
        out = self.bn2(out)
        out = self.relu(out)
        out = self.dropout(out)
        return self.relu(out + residual)


class TCN(nn.Module):
    def __init__(self, n_features, channels=[64, 64, 64], kernel_size=3, dropout=0.2):
        super().__init__()
        layers = []
        in_ch = n_features
        for out_ch in channels:
            layers.append(TCNBlock(in_ch, out_ch, kernel_size, dropout))
            in_ch = out_ch
        self.tcn = nn.Sequential(*layers)
        self.fc = nn.Linear(channels[-1], 1)

    def forward(self, x):
        # x: (batch, seq, features) -> (batch, features, seq)
        out = self.tcn(x.permute(0, 2, 1))
        return self.fc(out[:, :, -1]).squeeze(-1)


# ── Training ─────────────────────────────────────────────────────────────────

def train_epoch(model, loader, optimizer, criterion):
    model.train()
    total_loss = 0
    n = 0
    for X_batch, y_batch in loader:
        X_batch, y_batch = X_batch.to(DEVICE), y_batch.to(DEVICE)
        optimizer.zero_grad()
        pred = model(X_batch)
        loss = criterion(pred, y_batch)
        loss.backward()
        torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
        optimizer.step()
        total_loss += loss.item() * len(y_batch)
        n += len(y_batch)
    return total_loss / n


def evaluate_model(model, loader):
    model.eval()
    preds = []
    trues = []
    with torch.no_grad():
        for X_batch, y_batch in loader:
            X_batch = X_batch.to(DEVICE)
            pred = model(X_batch).cpu().numpy()
            preds.append(pred)
            trues.append(y_batch.numpy())
    preds = np.concatenate(preds)
    trues = np.concatenate(trues)
    return trues, preds


def compute_dl_metrics(y_true, y_pred, prefix=""):
    mae = mean_absolute_error(y_true, y_pred)
    rmse = np.sqrt(mean_squared_error(y_true, y_pred))
    r2 = r2_score(y_true, y_pred)
    mask = y_true > 0.1
    mape = np.mean(np.abs((y_true[mask] - y_pred[mask]) / y_true[mask])) * 100 if mask.sum() > 0 else np.nan
    return {
        f"{prefix}MAE": round(float(mae), 4),
        f"{prefix}RMSE": round(float(rmse), 4),
        f"{prefix}R2": round(float(r2), 4),
        f"{prefix}MAPE": round(float(mape), 2) if not np.isnan(mape) else None,
    }


def train_dl_model(model, train_loader, val_loader, test_loader,
                    model_name, epochs=150, lr=1e-3, patience=20):
    model = model.to(DEVICE)
    optimizer = torch.optim.Adam(model.parameters(), lr=lr, weight_decay=1e-5)
    scheduler = torch.optim.lr_scheduler.ReduceLROnPlateau(optimizer, patience=10, factor=0.5, min_lr=1e-6)
    criterion = nn.MSELoss()

    best_val_mae = float("inf")
    best_state = None
    no_improve = 0

    t0 = time.time()
    for epoch in range(epochs):
        train_loss = train_epoch(model, train_loader, optimizer, criterion)

        model.eval()
        val_true, val_pred = evaluate_model(model, val_loader)
        val_mae = mean_absolute_error(val_true, val_pred)
        scheduler.step(val_mae)

        if val_mae < best_val_mae:
            best_val_mae = val_mae
            best_state = {k: v.cpu().clone() for k, v in model.state_dict().items()}
            no_improve = 0
        else:
            no_improve += 1

        if no_improve >= patience:
            print(f"  {model_name}: early stopping at epoch {epoch+1}")
            break

        if (epoch + 1) % 20 == 0:
            print(f"  {model_name} epoch {epoch+1}: train_loss={train_loss:.4f}, val_MAE={val_mae:.4f}")

    train_time = time.time() - t0

    if best_state is not None:
        model.load_state_dict(best_state)
        model = model.to(DEVICE)

    train_true, train_pred = evaluate_model(model, train_loader)
    val_true, val_pred = evaluate_model(model, val_loader)
    test_true, test_pred = evaluate_model(model, test_loader)

    results = {
        "model": model_name,
        "train": compute_dl_metrics(train_true, train_pred, "train_"),
        "validation": compute_dl_metrics(val_true, val_pred, "validation_"),
        "test": compute_dl_metrics(test_true, test_pred, "test_"),
        "train_time": round(train_time, 1),
        "epochs_trained": epoch + 1,
    }

    print(f"  {model_name}: val MAE={results['validation']['validation_MAE']:.4f}, "
          f"test MAE={results['test']['test_MAE']:.4f}, "
          f"test R²={results['test']['test_R2']:.4f}")

    return results, model


# ── Main ─────────────────────────────────────────────────────────────────────

def main():
    t_start = time.time()
    print("=" * 70)
    print("WATER DEMAND — DEEP LEARNING MODELS")
    print("=" * 70)

    # 1. Prepare data
    print("\n[1] Preparing data...")
    data, n_features, num_feats, cat_feats, num_scaler, cat_encoder = prepare_data()
    print(f"  Features: {n_features}")
    print(f"  Train: {len(data['train']['y']):,}, Val: {len(data['validation']['y']):,}, "
          f"Test: {len(data['test']['y']):,}")

    # 2. Create loaders for MLP (flat features)
    print("\n[2] Training MLP...")
    batch_size = 256
    mlp_train = DataLoader(WaterDemandDataset(data["train"]["X"], data["train"]["y"]),
                           batch_size=batch_size, shuffle=True)
    mlp_val = DataLoader(WaterDemandDataset(data["validation"]["X"], data["validation"]["y"]),
                         batch_size=batch_size)
    mlp_test = DataLoader(WaterDemandDataset(data["test"]["X"], data["test"]["y"]),
                          batch_size=batch_size)

    mlp = MLP(n_features, hidden_sizes=[256, 128, 64], dropout=0.2)
    mlp_results, mlp_model = train_dl_model(
        mlp, mlp_train, mlp_val, mlp_test, "MLP",
        epochs=150, lr=1e-3, patience=20
    )

    # 3. Create sequence data for LSTM/GRU/TCN
    print("\n[3] Preparing sequence data (24h lookback)...")
    seq_len = 24
    seq_train = WaterDemandSequenceDataset(
        data["train"]["X"], data["train"]["y"], data["train"]["dev_ids"], seq_len
    )
    seq_val = WaterDemandSequenceDataset(
        data["validation"]["X"], data["validation"]["y"], data["validation"]["dev_ids"], seq_len
    )
    seq_test = WaterDemandSequenceDataset(
        data["test"]["X"], data["test"]["y"], data["test"]["dev_ids"], seq_len
    )
    print(f"  Sequences — train: {len(seq_train):,}, val: {len(seq_val):,}, test: {len(seq_test):,}")

    seq_batch = 128
    lstm_train = DataLoader(seq_train, batch_size=seq_batch, shuffle=True)
    lstm_val = DataLoader(seq_val, batch_size=seq_batch)
    lstm_test = DataLoader(seq_test, batch_size=seq_batch)

    # 4. LSTM
    print("\n[4] Training LSTM...")
    lstm = LSTMModel(n_features, hidden_size=128, n_layers=2, dropout=0.2)
    lstm_results, lstm_model = train_dl_model(
        lstm, lstm_train, lstm_val, lstm_test, "LSTM",
        epochs=150, lr=1e-3, patience=20
    )

    # 5. GRU
    print("\n[5] Training GRU...")
    gru = GRUModel(n_features, hidden_size=128, n_layers=2, dropout=0.2)
    gru_results, gru_model = train_dl_model(
        gru, lstm_train, lstm_val, lstm_test, "GRU",
        epochs=150, lr=1e-3, patience=20
    )

    # 6. TCN
    print("\n[6] Training TCN...")
    tcn = TCN(n_features, channels=[64, 64, 64], kernel_size=3, dropout=0.2)
    tcn_results, tcn_model = train_dl_model(
        tcn, lstm_train, lstm_val, lstm_test, "TCN",
        epochs=150, lr=1e-3, patience=20
    )

    # 7. Summary
    print("\n" + "=" * 70)
    print("DEEP LEARNING RESULTS SUMMARY")
    print("=" * 70)

    all_results = [mlp_results, lstm_results, gru_results, tcn_results]
    rows = []
    for r in all_results:
        rows.append({
            "model": r["model"],
            "val_MAE": r["validation"]["validation_MAE"],
            "val_RMSE": r["validation"]["validation_RMSE"],
            "val_R2": r["validation"]["validation_R2"],
            "test_MAE": r["test"]["test_MAE"],
            "test_RMSE": r["test"]["test_RMSE"],
            "test_R2": r["test"]["test_R2"],
            "train_time_s": r["train_time"],
            "epochs": r["epochs_trained"],
        })

    results_df = pd.DataFrame(rows).sort_values("val_MAE")
    print(results_df.to_string(index=False))

    # 8. Save
    REPORTS_DIR.mkdir(parents=True, exist_ok=True)
    results_df.to_csv(REPORTS_DIR / "dl_results.csv", index=False)

    # Save the best DL model
    best_dl = all_results[0]
    for r in all_results:
        if r["validation"]["validation_MAE"] < best_dl["validation"]["validation_MAE"]:
            best_dl = r

    print(f"\nBest DL model: {best_dl['model']} "
          f"(val MAE={best_dl['validation']['validation_MAE']:.4f}, "
          f"test MAE={best_dl['test']['test_MAE']:.4f})")

    # Save all DL models
    dl_artifacts = {
        "mlp": {"model": mlp_model, "results": mlp_results},
        "lstm": {"model": lstm_model, "results": lstm_results},
        "gru": {"model": gru_model, "results": gru_results},
        "tcn": {"model": tcn_model, "results": tcn_results},
    }
    joblib.dump(dl_artifacts, MODELS_DIR / "dl_models.joblib")
    print(f"  Saved DL models to {MODELS_DIR / 'dl_models.joblib'}")

    total_time = time.time() - t_start
    print(f"\nTotal DL training time: {total_time:.1f}s")
    return all_results


if __name__ == "__main__":
    main()
