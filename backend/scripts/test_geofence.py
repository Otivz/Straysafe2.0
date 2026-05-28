SELERA_POLYGON = [
    (14.801496, 121.005174),
    (14.799577, 121.003911),
    (14.800634, 121.002228),
    (14.802461, 121.003280)
]

def is_inside_selera_homes(lat: float, lng: float) -> bool:
    n = len(SELERA_POLYGON)
    inside = False
    p1x, p1y = SELERA_POLYGON[0]
    for i in range(n + 1):
        p2x, p2y = SELERA_POLYGON[i % n]
        if lat > min(p1x, p2x):
            if lat <= max(p1x, p2x):
                if lng <= max(p1y, p2y):
                    xints = 0.0
                    if p1x != p2x:
                        xints = (lat - p1x) * (p2y - p1y) / (p2x - p1x) + p1y
                    if p1y == p2y or lng <= xints:
                        inside = not inside
        p1x, p1y = p2x, p2y
    return inside

lat, lng = 14.801313, 121.003109
print(f"Is ({lat}, {lng}) inside Selera Homes?", is_inside_selera_homes(lat, lng))
