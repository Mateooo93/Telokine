# Devlog 1: started with a cube that did nothing

**June ~10**

I picked Telokine because I kept seeing RL demos where everything happens in a notebook. I wanted the opposite: drag blocks, press a button, see a cube move.

First week was mostly the 3D view. I used react-three-fiber because plain Three.js in React was confusing me. Got a cube, a yellow target sphere, orbit camera. Felt good just selecting things and moving them with the gizmo.

Then I tried connecting the frontend to Python. That took longer than the 3D part. WebSockets, sending the scene as JSON, trying to understand why nothing moved when I hit Run.

Screenshot from this week was literally one orange cube and a yellow ball on a grid. Not impressive but it was mine.

Repo: https://github.com/Mateooo93/Telokine
