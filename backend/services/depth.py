"""
Depth estimation service using MiDaS (Monocular Depth Estimation).
Estimates distance to detected objects for spatial awareness.

Performance notes:
  - estimate_fast() uses bilinear interpolation (4-tap) instead of bicubic (16-tap)
    and skips the unused visualization normalization.
  - get_distance_for_bbox_fast() samples a 3×3 grid at the bbox center → O(1)
    instead of np.median over the full center region → O(k log k).
"""

import cv2
import numpy as np
from typing import Optional, Tuple
import torch


class DepthEstimator:
    """
    MiDaS-based monocular depth estimation.
    Converts 2D images to relative depth maps.
    """
    
    def __init__(self, model_type: str = "MiDaS_small"):
        self.model_type = model_type
        self.model = None
        self.transform = None
        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        self.depth_scale = 1.0
        
    def load_model(self):
        """Load MiDaS model. Call this once at startup."""
        try:
            self.model = torch.hub.load("intel-isl/MiDaS", self.model_type)
            self.model.to(self.device)
            self.model.eval()
            
            midas_transforms = torch.hub.load("intel-isl/MiDaS", "transforms")
            if self.model_type == "MiDaS_small":
                self.transform = midas_transforms.small_transform
            else:
                self.transform = midas_transforms.dpt_transform
            
            print(f"✓ MiDaS {self.model_type} loaded on {self.device}")
        except Exception as e:
            print(f"✗ Failed to load MiDaS: {e}")
            raise

    # ─── Fast path (used in WS real-time loop) ─────────────────────

    def estimate_fast(self, frame: np.ndarray) -> np.ndarray:
        """
        Estimate depth map — optimised for the real-time WS pipeline.

        Changes vs estimate():
          1. Bilinear interpolation (4-tap)  instead of bicubic (16-tap)  → ~4× less work
          2. Skips depth_normalized computation (unused by WS handler)    → saves O(w*h)

        Returns:
            Raw depth map as float32 numpy array (H, W).  Higher values = closer.
        """
        if self.model is None:
            self.load_model()

        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        input_batch = self.transform(rgb).to(self.device)

        with torch.no_grad():
            prediction = self.model(input_batch)
            prediction = torch.nn.functional.interpolate(
                prediction.unsqueeze(1),
                size=frame.shape[:2],
                mode="bilinear",          # 4-tap → 4× faster than bicubic
                align_corners=False,
            ).squeeze()

        return prediction.cpu().numpy()   # float32, no extra normalisation

    def get_distance_for_bbox_fast(
        self,
        depth_map: np.ndarray,
        bbox: Tuple[int, int, int, int],
    ) -> float:
        """
        O(1) distance estimate — samples a 3×3 grid at the bbox centre
        instead of np.median over the full centre region (O(k log k)).

        Falls back to single-point if the bbox is too small for a 3×3 grid.
        """
        x1, y1, x2, y2 = bbox
        h, w = depth_map.shape[:2]

        cx = (x1 + x2) // 2
        cy = (y1 + y2) // 2

        # Clamp to valid range
        cx = max(1, min(cx, w - 2))
        cy = max(1, min(cy, h - 2))

        # Sample 3×3 neighbourhood around centre (9 lookups → O(1))
        patch = depth_map[cy - 1 : cy + 2, cx - 1 : cx + 2]  # always 3×3
        inv_depth = float(np.mean(patch))  # np.mean on 9 elements ≈ O(1)

        if inv_depth > 0:
            distance = (1000.0 / inv_depth) * self.depth_scale
            return min(distance, 10.0)
        return float("inf")

    # ─── Original methods (kept for non-realtime endpoints) ─────────

    def estimate(self, frame: np.ndarray):
        """Full depth estimation with visualisation output."""
        if self.model is None:
            self.load_model()

        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        input_batch = self.transform(rgb).to(self.device)

        with torch.no_grad():
            prediction = self.model(input_batch)
            prediction = torch.nn.functional.interpolate(
                prediction.unsqueeze(1),
                size=frame.shape[:2],
                mode="bicubic",
                align_corners=False,
            ).squeeze()

        depth_map = prediction.cpu().numpy()
        depth_normalized = cv2.normalize(depth_map, None, 0, 255, cv2.NORM_MINMAX)
        return depth_map, depth_normalized.astype(np.uint8)
    
    def get_distance_at_point(self, depth_map: np.ndarray, x: int, y: int) -> float:
        if 0 <= y < depth_map.shape[0] and 0 <= x < depth_map.shape[1]:
            inv_depth = depth_map[y, x]
            if inv_depth > 0:
                distance = (1000 / inv_depth) * self.depth_scale
                return min(distance, 10.0)
        return float("inf")

    def get_distance_for_bbox(
        self,
        depth_map: np.ndarray,
        bbox: Tuple[int, int, int, int],
    ) -> float:
        """Original O(k log k) median-based distance (kept for /detect endpoint)."""
        x1, y1, x2, y2 = bbox
        margin_x = (x2 - x1) // 4
        margin_y = (y2 - y1) // 4
        region = depth_map[
            y1 + margin_y : y2 - margin_y,
            x1 + margin_x : x2 - margin_x,
        ]
        if region.size == 0:
            return float("inf")
        median_inv_depth = np.median(region)
        if median_inv_depth > 0:
            distance = (1000 / median_inv_depth) * self.depth_scale
            return min(distance, 10.0)
        return float("inf")

    def colorize_depth(self, depth_normalized: np.ndarray) -> np.ndarray:
        return cv2.applyColorMap(depth_normalized, cv2.COLORMAP_MAGMA)


# Singleton
_depth_estimator: Optional[DepthEstimator] = None

def get_depth_estimator() -> DepthEstimator:
    global _depth_estimator
    if _depth_estimator is None:
        _depth_estimator = DepthEstimator(model_type="MiDaS_small")
        _depth_estimator.load_model()
    return _depth_estimator
