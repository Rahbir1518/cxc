"""
Depth estimation service using MiDaS (Monocular Depth Estimation).
Estimates distance to detected objects for spatial awareness.
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
        """
        Initialize depth estimator.
        
        Args:
            model_type: 'MiDaS_small' (fast), 'DPT_Hybrid' (balanced), 'DPT_Large' (accurate)
        """
        self.model_type = model_type
        self.model = None
        self.transform = None
        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        
        # Calibration factor to convert relative depth to meters
        # This needs to be calibrated for your specific camera
        self.depth_scale = 1.0
        
    def load_model(self):
        """Load MiDaS model. Call this once at startup."""
        try:
            # Load MiDaS from torch hub
            self.model = torch.hub.load("intel-isl/MiDaS", self.model_type)
            self.model.to(self.device)
            self.model.eval()
            
            # Load transforms
            midas_transforms = torch.hub.load("intel-isl/MiDaS", "transforms")
            if self.model_type == "MiDaS_small":
                self.transform = midas_transforms.small_transform
            else:
                self.transform = midas_transforms.dpt_transform
            
            print(f"✓ MiDaS {self.model_type} loaded on {self.device}")
        except Exception as e:
            print(f"✗ Failed to load MiDaS: {e}")
            raise
    
    def estimate(self, frame: np.ndarray) -> np.ndarray:
        """
        Estimate depth map from image.
        
        Args:
            frame: BGR image as numpy array
            
        Returns:
            Depth map as numpy array (H, W), higher values = closer
        """
        if self.model is None:
            self.load_model()
        
        # Convert BGR to RGB
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        
        # Apply transforms
        input_batch = self.transform(rgb).to(self.device)
        
        # Inference
        with torch.no_grad():
            prediction = self.model(input_batch)
            
            # Resize to original size
            prediction = torch.nn.functional.interpolate(
                prediction.unsqueeze(1),
                size=frame.shape[:2],
                mode="bicubic",
                align_corners=False,
            ).squeeze()
        
        depth_map = prediction.cpu().numpy()
        
        # Normalize for visualization (0-255)
        depth_normalized = cv2.normalize(depth_map, None, 0, 255, cv2.NORM_MINMAX)
        
        return depth_map, depth_normalized.astype(np.uint8)
    
    def get_distance_at_point(self, depth_map: np.ndarray, x: int, y: int) -> float:
        """
        Get estimated distance at a specific pixel.
        
        Args:
            depth_map: Output from estimate()
            x, y: Pixel coordinates
            
        Returns:
            Estimated distance in meters (approximate)
        """
        if 0 <= y < depth_map.shape[0] and 0 <= x < depth_map.shape[1]:
            # MiDaS outputs inverse depth (higher = closer)
            # Convert to approximate meters
            inv_depth = depth_map[y, x]
            if inv_depth > 0:
                # Simple inverse relationship
                # This is a rough approximation - calibrate for accuracy
                distance = (1000 / inv_depth) * self.depth_scale
                return min(distance, 10.0)  # Cap at 10m
        return float("inf")
    
    def get_distance_for_bbox(
        self,
        depth_map: np.ndarray,
        bbox: Tuple[int, int, int, int],
    ) -> float:
        """
        Get estimated distance to an object defined by bounding box.
        Uses median of center region for robustness.
        
        Args:
            depth_map: Output from estimate()
            bbox: (x1, y1, x2, y2) of object
            
        Returns:
            Estimated distance in meters
        """
        x1, y1, x2, y2 = bbox
        
        # Sample center 50% of bounding box
        margin_x = (x2 - x1) // 4
        margin_y = (y2 - y1) // 4
        
        region = depth_map[
            y1 + margin_y : y2 - margin_y,
            x1 + margin_x : x2 - margin_x,
        ]
        
        if region.size == 0:
            return float("inf")
        
        # Use median inverse depth
        median_inv_depth = np.median(region)
        if median_inv_depth > 0:
            distance = (1000 / median_inv_depth) * self.depth_scale
            return min(distance, 10.0)
        
        return float("inf")
    
    def colorize_depth(self, depth_normalized: np.ndarray) -> np.ndarray:
        """
        Convert depth map to colorized visualization.
        
        Args:
            depth_normalized: Normalized depth map (0-255)
            
        Returns:
            BGR colorized depth map
        """
        return cv2.applyColorMap(depth_normalized, cv2.COLORMAP_MAGMA)


# Singleton instance
_depth_estimator: Optional[DepthEstimator] = None


def get_depth_estimator() -> DepthEstimator:
    """Get or create the singleton depth estimator."""
    global _depth_estimator
    if _depth_estimator is None:
        _depth_estimator = DepthEstimator(model_type="MiDaS_small")
        _depth_estimator.load_model()
    return _depth_estimator
