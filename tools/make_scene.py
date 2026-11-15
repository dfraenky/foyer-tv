"""Photo -> scene for the ambient home: a 1920x1080 crop, the sky cut out (GrabCut, OpenCV), a blurred glass copy, the skyline height.
Usage: python3 tools/make_scene.py photo.jpg web/scenes p-name [crop 0..1] [sure-sky rows] [sky limit]  (needs opencv-python-headless, numpy)"""
import sys, json
import numpy as np, cv2
src, dst, name = sys.argv[1], sys.argv[2], sys.argv[3]
pos = float(sys.argv[4]) if len(sys.argv) > 4 else 0.5
im = cv2.imread(src)
s = 1920 / im.shape[1]; im = cv2.resize(im, (1920, int(im.shape[0] * s)), interpolation=cv2.INTER_AREA)
if im.shape[0] < 1080:
    s = 1080 / im.shape[0]; im = cv2.resize(im, (int(im.shape[1] * s), 1080), interpolation=cv2.INTER_AREA)
    x0 = (im.shape[1] - 1920) // 2; im = im[:, x0:x0 + 1920]
y0 = int((im.shape[0] - 1080) * pos); im = im[y0:y0 + 1080]
small = cv2.resize(im, (960, 540), interpolation=cv2.INTER_AREA)
hsv = cv2.cvtColor(small, cv2.COLOR_BGR2HSV).astype(np.float32)
gray = cv2.cvtColor(small, cv2.COLOR_BGR2GRAY).astype(np.float32)
texture = cv2.GaussianBlur(np.abs(cv2.Laplacian(gray, cv2.CV_32F)), (0, 0), 3)
# A first guess: the sky is smooth and sits above everything else.
mask = np.full(gray.shape, cv2.GC_PR_FGD, np.uint8)
ys = np.arange(540)[:, None] * np.ones((1, 960))
smooth = texture < np.percentile(texture[:60], 90) * 1.3
LIMIT = int(sys.argv[6]) if len(sys.argv) > 6 else 330
mask[(smooth) & (ys < LIMIT)] = cv2.GC_PR_BGD
mask[LIMIT:] = np.where(mask[LIMIT:] == cv2.GC_PR_BGD, cv2.GC_PR_FGD, mask[LIMIT:])
if len(sys.argv) > 6: mask[LIMIT + 20:] = cv2.GC_FGD
mask[:int(sys.argv[5]) if len(sys.argv) > 5 else 40] = cv2.GC_BGD
mask[440:] = cv2.GC_FGD
bgm, fgm = np.zeros((1, 65), np.float64), np.zeros((1, 65), np.float64)
cv2.grabCut(small, mask, None, bgm, fgm, 6, cv2.GC_INIT_WITH_MASK)
fg = np.where((mask == cv2.GC_FGD) | (mask == cv2.GC_PR_FGD), 255, 0).astype(np.uint8)
# Keep the land connected to the bottom; fill the sky's holes in it only when small.
n, lab, stats, _ = cv2.connectedComponentsWithStats(fg)
keep = np.zeros_like(fg)
for i in range(1, n):
    if stats[i, cv2.CC_STAT_TOP] + stats[i, cv2.CC_STAT_HEIGHT] >= 500 or stats[i, cv2.CC_STAT_AREA] > 4000: keep[lab == i] = 255
inv = 255 - keep; n2, lab2, st2, _ = cv2.connectedComponentsWithStats(inv)
for i in range(1, n2):
    if st2[i, cv2.CC_STAT_TOP] > 0 and st2[i, cv2.CC_STAT_AREA] < 600: keep[lab2 == i] = 255
alpha = cv2.resize(keep, (1920, 1080), interpolation=cv2.INTER_LINEAR)
alpha = cv2.GaussianBlur(alpha, (0, 0), 1.2)
cv2.imwrite(dst + '/' + name + '.jpg', im, [cv2.IMWRITE_JPEG_QUALITY, 86])
rgba = np.dstack([im, alpha]); cv2.imwrite(dst + '/' + name + '-fg.webp', rgba, [cv2.IMWRITE_WEBP_QUALITY, 86])
glass = cv2.GaussianBlur(im, (0, 0), 28); glass = cv2.convertScaleAbs(glass, alpha=1.12, beta=18)
cv2.imwrite(dst + '/' + name + '-glass.jpg', glass, [cv2.IMWRITE_JPEG_QUALITY, 80])
# The skyline in the middle (where the clock stands): the first land row of each column, the median.
mid = alpha[:, 560:1360] > 128
first = np.argmax(mid, axis=0); first[~mid.any(axis=0)] = 1080
print(json.dumps({'name': name, 'skyline': int(np.median(first)), 'skylineHigh': int(np.percentile(first, 15))}))
