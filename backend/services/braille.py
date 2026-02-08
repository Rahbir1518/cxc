"""
Braille Recognition Service
Dual approach:
  1. OpenCV blob detection → cell grouping → character mapping (pure CV)
  2. Google Gemini Vision API (AI-powered, handles real-world images)
"""

import os
import io
import base64
import numpy as np
from PIL import Image
from dotenv import load_dotenv

load_dotenv()

# ─── Standard Braille Alphabet Mapping ───────────────────────────────────────
# Braille cell dot positions:
#   1 4
#   2 5
#   3 6
# Each character is represented as a frozenset of raised dot positions.
BRAILLE_TO_CHAR = {
    frozenset([1]):          'a',
    frozenset([1, 2]):       'b',
    frozenset([1, 4]):       'c',
    frozenset([1, 4, 5]):    'd',
    frozenset([1, 5]):       'e',
    frozenset([1, 2, 4]):    'f',
    frozenset([1, 2, 4, 5]): 'g',
    frozenset([1, 2, 5]):    'h',
    frozenset([2, 4]):       'i',
    frozenset([2, 4, 5]):    'j',
    frozenset([1, 3]):       'k',
    frozenset([1, 2, 3]):    'l',
    frozenset([1, 3, 4]):    'm',
    frozenset([1, 3, 4, 5]): 'n',
    frozenset([1, 3, 5]):    'o',
    frozenset([1, 2, 3, 4]): 'p',
    frozenset([1, 2, 3, 4, 5]): 'q',
    frozenset([1, 2, 3, 5]): 'r',
    frozenset([2, 3, 4]):    's',
    frozenset([2, 3, 4, 5]): 't',
    frozenset([1, 3, 6]):    'u',
    frozenset([1, 2, 3, 6]): 'v',
    frozenset([2, 4, 5, 6]): 'w',
    frozenset([1, 3, 4, 6]): 'x',
    frozenset([1, 3, 4, 5, 6]): 'y',
    frozenset([1, 3, 5, 6]): 'z',
    # Numbers (preceded by number indicator ⠼ = dots 3,4,5,6)
    frozenset([3, 4, 5, 6]): '#',  # Number indicator
    # Space
    frozenset():             ' ',
}

# Number mapping (after number indicator, letters a-j become 1-0)
LETTER_TO_NUMBER = {
    'a': '1', 'b': '2', 'c': '3', 'd': '4', 'e': '5',
    'f': '6', 'g': '7', 'h': '8', 'i': '9', 'j': '0',
}


# ─── OpenCV-based Braille Detection ──────────────────────────────────────────

def detect_braille_opencv(image_bytes: bytes) -> str:
    """
    Detect braille from an image using OpenCV blob detection.
    
    Pipeline:
      1. Convert to grayscale
      2. Apply adaptive thresholding
      3. Detect blobs (dots)
      4. Group dots into braille cells
      5. Map cells to characters
    
    Returns the decoded text string.
    """
    import cv2

    # Decode image
    nparr = np.frombuffer(image_bytes, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    if img is None:
        return ""

    # Resize for consistency (normalize to ~800px width)
    h, w = img.shape[:2]
    scale = 800 / w if w > 800 else 1.0
    img = cv2.resize(img, (int(w * scale), int(h * scale)))

    # Convert to grayscale
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

    # Apply Gaussian blur to reduce noise
    blurred = cv2.GaussianBlur(gray, (5, 5), 0)

    # Adaptive thresholding to isolate dots
    thresh = cv2.adaptiveThreshold(
        blurred, 255,
        cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY_INV,
        blockSize=15,
        C=8
    )

    # Set up SimpleBlobDetector for dot detection
    params = cv2.SimpleBlobDetector_Params()

    # Filter by area (braille dots are small circles)
    params.filterByArea = True
    params.minArea = 30
    params.maxArea = 3000

    # Filter by circularity (dots are round)
    params.filterByCircularity = True
    params.minCircularity = 0.5

    # Filter by convexity
    params.filterByConvexity = True
    params.minConvexity = 0.5

    # Filter by inertia (roundness)
    params.filterByInertia = True
    params.minInertiaRatio = 0.3

    detector = cv2.SimpleBlobDetector_create(params)

    # Detect blobs on inverted threshold
    keypoints = detector.detect(thresh)

    if not keypoints:
        # Try with different parameters for embossed braille
        params2 = cv2.SimpleBlobDetector_Params()
        params2.filterByArea = True
        params2.minArea = 15
        params2.maxArea = 5000
        params2.filterByCircularity = True
        params2.minCircularity = 0.3
        params2.filterByConvexity = False
        params2.filterByInertia = False
        detector2 = cv2.SimpleBlobDetector_create(params2)
        keypoints = detector2.detect(thresh)

    if not keypoints:
        return ""

    # Extract dot centers
    dots = [(int(kp.pt[0]), int(kp.pt[1])) for kp in keypoints]
    dots.sort(key=lambda d: (d[0], d[1]))  # Sort left-to-right, top-to-bottom

    if len(dots) < 1:
        return ""

    # Estimate cell dimensions from dot spacing
    dot_sizes = [kp.size for kp in keypoints]
    avg_dot_size = np.mean(dot_sizes)

    # Estimate horizontal and vertical spacing
    # In standard braille, dots within a cell are ~2.5mm apart
    # Cells are ~6.1mm apart horizontally, ~10mm apart vertically
    cell_width = avg_dot_size * 4    # approximate cell width
    cell_height = avg_dot_size * 6   # approximate cell height
    dot_spacing = avg_dot_size * 2   # spacing between dots in a cell

    # Group dots into cells using clustering
    cells = _group_dots_into_cells(dots, cell_width, cell_height, dot_spacing)

    # Map each cell to a character
    text = _cells_to_text(cells, dot_spacing)

    return text


def _group_dots_into_cells(dots, cell_width, cell_height, dot_spacing):
    """Group detected dots into braille cells based on spatial proximity."""
    if not dots:
        return []

    # Cluster dots by x-coordinate to find columns of cells
    xs = sorted(set(d[0] for d in dots))
    ys = sorted(set(d[1] for d in dots))

    # Use simple grid-based clustering
    # Find distinct x-clusters (each representing a cell column)
    x_clusters = []
    current_cluster = [xs[0]]
    for x in xs[1:]:
        if x - current_cluster[-1] < dot_spacing * 1.5:
            current_cluster.append(x)
        else:
            x_clusters.append(current_cluster)
            current_cluster = [x]
    x_clusters.append(current_cluster)

    # Pair adjacent x-clusters into cell columns (each cell has 2 dot columns)
    cell_columns = []
    i = 0
    while i < len(x_clusters):
        if i + 1 < len(x_clusters):
            c1_center = np.mean(x_clusters[i])
            c2_center = np.mean(x_clusters[i + 1])
            if c2_center - c1_center < cell_width * 0.7:
                cell_columns.append((x_clusters[i], x_clusters[i + 1]))
                i += 2
                continue
        cell_columns.append((x_clusters[i], []))
        i += 1

    # Find y-row clusters
    y_clusters = []
    current_cluster = [ys[0]]
    for y in ys[1:]:
        if y - current_cluster[-1] < dot_spacing * 1.5:
            current_cluster.append(y)
        else:
            y_clusters.append(np.mean(current_cluster))
            current_cluster = [y]
    y_clusters.append(np.mean(current_cluster))

    # For each cell column, determine which dots are raised
    cells = []
    for left_col, right_col in cell_columns:
        cell_x_min = min(left_col) - dot_spacing
        cell_x_max = max(right_col if right_col else left_col) + dot_spacing
        cell_x_mid = (min(left_col) + max(right_col if right_col else left_col)) / 2

        # Find dots belonging to this cell
        cell_dots = [d for d in dots if cell_x_min <= d[0] <= cell_x_max]

        if not cell_dots:
            continue

        # Determine which of the 6 positions have dots
        raised_dots = set()
        cell_ys = sorted(set(d[1] for d in cell_dots))

        # Find up to 3 y-rows in this cell
        cell_y_rows = []
        current_row = [cell_ys[0]]
        for y in cell_ys[1:]:
            if y - current_row[-1] < dot_spacing * 1.5:
                current_row.append(y)
            else:
                cell_y_rows.append(np.mean(current_row))
                current_row = [y]
        cell_y_rows.append(np.mean(current_row))

        for dot in cell_dots:
            # Determine column (left=1,2,3 or right=4,5,6)
            is_right = dot[0] > cell_x_mid

            # Determine row (1=top, 2=mid, 3=bottom)
            row = 1
            if len(cell_y_rows) >= 2:
                distances = [abs(dot[1] - yr) for yr in cell_y_rows]
                row = distances.index(min(distances)) + 1
            row = min(row, 3)

            if is_right:
                dot_num = row + 3  # 4, 5, or 6
            else:
                dot_num = row  # 1, 2, or 3

            raised_dots.add(dot_num)

        cells.append(raised_dots)

    return cells


def _cells_to_text(cells, dot_spacing):
    """Convert braille cells (sets of raised dot numbers) to text."""
    text = []
    number_mode = False

    for cell in cells:
        key = frozenset(cell)

        if key == frozenset():
            text.append(' ')
            number_mode = False
            continue

        char = BRAILLE_TO_CHAR.get(key, '?')

        if char == '#':
            number_mode = True
            continue

        if number_mode and char in LETTER_TO_NUMBER:
            text.append(LETTER_TO_NUMBER[char])
        else:
            text.append(char)
            if char == ' ':
                number_mode = False

    return ''.join(text)


# ─── Gemini Vision-based Braille Detection ────────────────────────────────────

def detect_braille_gemini(image_bytes: bytes) -> str:
    """
    Use Google Gemini Vision API to read braille from an image.
    This is more reliable for real-world photos.
    
    Returns the decoded text string.
    """
    import google.generativeai as genai

    api_key = os.getenv("GOOGLE_GEMINI_API_KEY") or os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise ValueError("GOOGLE_GEMINI_API_KEY or GEMINI_API_KEY not set in environment")

    genai.configure(api_key=api_key)

    # Load image
    img = Image.open(io.BytesIO(image_bytes))

    # Use Gemini 2.0 Flash for vision
    model = genai.GenerativeModel("gemini-2.0-flash")

    prompt = """You are a braille recognition expert. Analyze this image carefully.

If this image contains braille text (raised dots arranged in cells of 2 columns × 3 rows):
1. Identify each braille cell in the image
2. Translate each cell to its corresponding letter, number, or symbol
3. Return ONLY the translated plain text, nothing else

If this image contains braille numbers:
1. Look for the number indicator (dots 3,4,5,6) followed by letter patterns
2. Translate: a=1, b=2, c=3, d=4, e=5, f=6, g=7, h=8, i=9, j=0
3. Return ONLY the numbers

If no braille is detected in the image, respond with exactly: NO_BRAILLE_DETECTED

Important: Return ONLY the translated text. No explanations, no formatting, no quotes."""

    response = model.generate_content([prompt, img])

    result = response.text.strip()

    if result == "NO_BRAILLE_DETECTED":
        return ""

    return result


# ─── Combined Detection (tries both approaches) ──────────────────────────────

async def detect_braille(image_bytes: bytes, method: str = "gemini") -> dict:
    """
    Main braille detection function.
    
    Args:
        image_bytes: Raw image bytes
        method: "gemini" (AI-powered), "opencv" (pure CV), or "both"
    
    Returns:
        dict with 'text', 'method', and 'confidence' keys
    """
    results = {}

    if method in ("gemini", "both"):
        try:
            gemini_text = detect_braille_gemini(image_bytes)
            if gemini_text:
                results["gemini"] = gemini_text
        except Exception as e:
            print(f"Gemini braille detection failed: {e}")

    if method in ("opencv", "both"):
        try:
            opencv_text = detect_braille_opencv(image_bytes)
            if opencv_text:
                results["opencv"] = opencv_text
        except Exception as e:
            print(f"OpenCV braille detection failed: {e}")

    # Pick the best result
    if "gemini" in results:
        return {
            "text": results["gemini"],
            "method": "gemini",
            "confidence": "high",
            "all_results": results,
        }
    elif "opencv" in results:
        return {
            "text": results["opencv"],
            "method": "opencv",
            "confidence": "medium",
            "all_results": results,
        }
    else:
        return {
            "text": "",
            "method": "none",
            "confidence": "none",
            "all_results": {},
        }
