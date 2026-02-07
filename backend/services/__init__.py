"""
Services module initialization.
Export detection and depth estimation services.
"""

from .detection import ObjectDetector, DetectedObject
from .depth import DepthEstimator

__all__ = ["ObjectDetector", "DetectedObject", "DepthEstimator"]
