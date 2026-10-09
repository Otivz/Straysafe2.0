# StraySafe AI test set (V3)

A set of photos where **people** wrote down the right answer, so the AI's answers can be counted as correct, false positive
or false negative (validation plan: `audit report and remediation/AI_ACCURACY_VALIDATION_IMPLEMENTATION.md`).

## 1. What to collect

| Folder (`photos/…`) | Condition | Target | Tips |
|---|---|---|---|
| `daylight` | Normal daylight, clear full body | 30 | The baseline: animal clearly visible, whole body |
| `low_light` | Low light / night | 20 | Evening, street light, indoors without flash |
| `angle` | Different angles | 20 | Side, back, from above, head only turned away |
| `partial` | Partial visibility | 20 | Behind a gate/fence, under a car, cropped by the frame, among objects |
| `small` | Small animals | 20 | Puppies, kittens, or an animal far away (small in the frame) |
| `breed` | Different breeds | 30 | Aspin, Puspin, Shih Tzu, Labrador, Persian, Siamese… note the breed |
| `negative` | **No animal** | 15 | Empty street, a bag, a toy dog, a statue, a dog picture on a shirt |

Plus **40 pairs** (`pairs_*.csv`): **20 same animal** (two different photos of one dog/cat) and **20 look-alikes that are
different animals** (same breed and colour if possible: these are the hard cases). Pair photos can live in any folder above.

**Total:** about 155 photos + 40 pairs.

## 2. Rules

- **Consent:** take the photos yourselves, or ask the owner's permission. No residents' photos from the live system without consent. No faces of people if avoidable.
- **One photo, one condition:** put each photo in the folder of its *main* difficulty (a dark photo of a puppy → `low_light` or `small`, pick one and note the other in `notes`).
- **Real photos only:** no AI-generated or edited images (the photo check would rightly flag them).
- **Formats:** `.jpg`, `.jpeg`, `.png` or `.webp`. Name files simply: `low_light/ll_001.jpg`.
- **Don't reuse the same photo** in two folders (the checker warns on identical files).

## 3. Labelling (two people, separately)

Each of the two labellers fills **their own** file without looking at the other's:
`labels_a.csv` / `labels_b.csv` and `pairs_a.csv` / `pairs_b.csv`.

### `labels_*.csv`: one row per photo

| Column | Values |
|---|---|
| `file` | Path inside `photos/`, e.g. `low_light/ll_001.jpg` |
| `condition` | The folder name: `daylight`, `low_light`, `angle`, `partial`, `small`, `breed`, `negative` |
| `animal_present` | `yes` / `no` |
| `species` | `dog`, `cat`, or `none` (when `animal_present` = no) |
| `count` | Number of dogs/cats in the photo (`0` for a negative) |
| `breed` | e.g. `Aspin`, `Puspin`, `Shih Tzu`; `unknown` if you can't tell |
| `main_colour` | Main coat colour: `White`, `Black`, `Brown`, `Tan`, `Gray`, `Orange`, `Cream`… (one word) |
| `size` | `small`, `medium`, `large`, or `unknown` |
| `notes` | Optional (e.g. "also small", "collar visible") |

Example:
```
file,condition,animal_present,species,count,breed,main_colour,size,notes
daylight/dl_001.jpg,daylight,yes,dog,1,Aspin,Brown,medium,
negative/ng_003.jpg,negative,no,none,0,,,,toy dog on a shelf
```

### `pairs_*.csv`: one row per pair

| Column | Values |
|---|---|
| `pair_id` | `P01`, `P02`… |
| `file_a`, `file_b` | Two photo paths inside `photos/` |
| `same` | `yes` (same individual animal) / `no` (different animals) |
| `condition` | The harder of the two photos' conditions, or `look_alike` for different animals that look alike |
| `notes` | Optional (how you know: same collar, owner confirmed…) |

**How to know two photos are the same animal:** take both photos yourselves of one known animal, or the owner confirms.
Never decide "same" from the photos alone.

## 4. Check, resolve, freeze

From the `backend` folder:

```
python scripts/check_test_set.py                # check files, compare the two labellers, count against the targets
python scripts/check_test_set.py --freeze       # when there are no errors or disagreements: write the final set
```

- **Disagreements** are listed in `disagreements.csv`. The two labellers look at those photos together, agree, and both
  update their file. Never pick one person's answer silently.
- The check also reports the **agreement between the labellers** per field (a number for the paper).
- `--freeze` writes `labels.csv`, `pairs.csv` and `manifest.json` (every photo's SHA-256 hash, the counts and the date).
  After that, **don't change the photos**: the evaluation (V4) refuses a photo whose hash changed. A changed set gets a new
  version: `--freeze --version 2`.
- Use `--allow-short` to freeze before every target is met (the report will say which conditions are short).

## 5. Storage

Photos are **not committed to git** (they are large); `photos/` is in `.gitignore` except the folder placeholders. Keep the
photos in the team's shared drive and commit only the CSV files and `manifest.json`: the hashes prove which photos were used.
