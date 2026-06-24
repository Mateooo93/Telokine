# Telokine

in this project you can uild 3d agents using the simple playground i made, this is interesting if you want to learn about reenforcement training without having to know how to code.
multiple features are available aswell as a tutorial of you need help! Have fun!

demo (ui only): https://mateooo93.github.io/Telokine/  
code: https://github.com/Mateooo93/Telokine

![screenshot](docs/screenshot-walker.png)

github pages is just the frontend. training needs the backend on your computer

## run it

```bash
npm install
npm run dev
```

```bash
cd backend
uv sync
uv run uvicorn telokine.server:app --port 8000
```

open http://localhost:1420, load the walker template, hit train then run trained

no gpu needed it falls back to your cpu

## quick tips

motors only move the robot. no motor = brick  
save build / load build in the top bar so you dont lose your robot  
press R to reset the camera  
library saves policies and block configs (needs backend running)

made for stardance by mateo
