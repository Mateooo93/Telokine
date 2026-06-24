# devlog: telokine is kinda working??

**project:** [Telokine](https://github.com/Mateooo93/Telokine)  
**demo (UI only):** https://mateooo93.github.io/Telokine/

![walker screenshot](../docs/screenshot-walker.png)

---

ok so i've been building this thing called **Telokine** for Stardance and the idea is basically — what if you could train a little robot without ever touching code?

like you drop cubes and wheels in a 3D scene, connect them with motors, drag reward blocks around ("go toward the target", "don't fall over", etc.), hit **Train**, and watch it actually learn. no pytorch notebooks. no "what's a tensor". just build → train → run.

## what i shipped this week

the big stuff:

- **3D builder** with starter robots (rover, walker, arm). you click a face on one part, click another part, and a motor snaps on. feels way better than when everything was just floating cubes lol
- **reward block editor** (the node canvas at the bottom). you wire sensors → rewards → PPO policy. each block has a little explanation now bc i kept forgetting what "curriculum" meant
- **actual physics** with MuJoCo on the backend. parts are connected in a real kinematic tree now, not fake glued-together stuff
- **training actually streams to the viewport**. every ~10 tries you see a checkpoint preview of what the policy learned so far. took forever to get the timing right bc it was literally teleporting before
- **Run trained** replays the policy after training (also had a bug where it forgot the saved model name 💀 fixed now)

## stuff that broke (a lot)

honestly the worst one was the cube **launching like 5 meters in the air** when you hit Run. turns out i was lifting only the agent body but not the wheels attached to it so the whole robot got stretched apart. very cursed.

also spent way too long on "why does my cube move with no motors??" — answer: i had magic body forces for the demo cube, which is NOT how real robots work. fixed it so **only motors move things** now. if you don't add a motor your agent just sits there like a brick. which is correct but felt wrong at first lol

GitHub Pages was another rabbit hole. i wanted people to try it online but Pages is **only static files** — no python, no training, no cpu to borrow. so the live link is the UI demo and you run the backend locally for the real sim. wrote that in the readme so future-me doesn't forget.

## stack (for anyone curious)

- frontend: react + three.js + zustand
- backend: python, fastapi, websockets
- sim: mujoco
- learning: stable-baselines3 (PPO)
- cpu fallback if you don't have a gpu (`TELOKINE_DEVICE=cpu`)

## what's next

- save/load projects (right now you lose everything on refresh basically)
- maybe tauri desktop app??
- more starter robots
- better motor tuning — full throttle sometimes makes physics go unstable

if you try it: clone the repo, `npm run dev` + backend on :8000, load the **Walker** template, hit Train. takes a bit on CPU but it's so satisfying when it finally reaches the yellow target

repo → https://github.com/Mateooo93/Telokine  
demo → https://mateooo93.github.io/Telokine/

— mateo / stardance ☄️
