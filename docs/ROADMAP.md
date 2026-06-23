# Roadmap

The rule: **never move to the next step until the previous one works reliably.**
Each step is independently shippable and validates one idea.

| #  | Step                  | Layer | Status      | Notes |
|----|-----------------------|-------|-------------|-------|
| 1  | 3D viewport           | 1     | ✅ **Done** | Floor, cube agent, target, orbit/zoom, add & drag objects, selection. |
| 2  | Physics simulation    | 2     | ✅ **Done** | MuJoCo world built from the scene model; ▶ Run streams a live gravity rollout to the viewport over `/ws/sim`. |
| 3  | Cube agent            | 2     | ⬜ Next     | Observation/action wiring so the cube can be controlled/learn. |
| 4  | Training backend      | 3     | ⬜          | SB3 PPO loop + telemetry callback over `/ws/train`. |
| 5  | Reward blocks         | 1→3   | ⬜          | Block editor UI → `reward.compile_blocks`/`evaluate`. |
| 6  | Train button          | 1↔3   | ⬜          | Wire **Train** to the backend; viewport mirrors live sim. |
| 7  | Progress graphs       | 1     | ⬜          | Live reward / success / episode charts from telemetry. |
| 8  | Save/load projects    | 1     | ⬜          | Serialize scene + blocks to disk. |
| 9  | Creature builder      | 1     | ⬜          | Assemble bodies from parts (LEGO, not engineering). |
| 10 | Joint editor          | 1↔2   | ⬜          | Connections become MuJoCo joints. |
| 11 | Creature templates    | 1     | ⬜          | Walker / Spider / Dog / Snake generators. |
| 12 | Humanoid templates    | 1↔2   | ⬜          | Highest difficulty — only after 9-11 are solid. |
| 13 | Sharing system        | —     | ⬜          | Out of v1 scope. |
| 14 | Marketplace           | —     | ⬜          | Out of v1 scope. |

## Definition of done for step 1

- [x] A 3D scene renders: floor, a cube (the agent), and a target sphere.
- [x] Camera orbit + zoom with sensible limits (can't go under the floor).
- [x] Add objects (cube / sphere / capsule / target / floor) from the palette.
- [x] Drag objects across the floor; selection with a status readout.
- [x] Looks like a game-engine editor, not an AI tool.

## Definition of done for step 2

- [x] Scene model → MuJoCo world (ground + dynamic cube + non-colliding target).
- [x] A "Run" rollout drops the cube under gravity and renders it live.
- [x] Y-up coordinates shared with Three.js (no conversion needed).
- [x] Auto-stops when the agent settles.
- [x] Live per-object transforms streamed over `/ws/sim`.

## Definition of done for step 3 (next)

- [ ] Define observation (pose, velocity, relative target vector).
- [ ] Define action (forces/torques on the cube).
- [ ] Wire it into the Gymnasium env so a policy (even random) can drive it.
