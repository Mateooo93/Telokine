# Devlog 2: the robot stretched like a slinky

**June ~15**

This week I added motors and starter robots (rover, walker). Connecting parts was the feature I cared about most. Click a face, click another block, motor snaps on. Felt great when it finally worked.

Then everything broke.

Hitting Run made the agent fly up and the wheels stayed on the ground. The whole robot looked stretched. Took me a whole evening to realize I was lifting the agent body in MuJoCo but not the child parts in the kinematic tree.

Also: the cube moved with zero motors. Turned out I had "magic" body forces so the demo cube could learn without wheels. Reviewers would hate that and honestly it confused me too. Switched to motor-only movement.

Training previews were another rabbit hole. They sent all frames instantly so it looked like teleporting. Added sleep timing on the backend so you can actually watch checkpoints.

Attached the walker screenshot here because that's when the UI finally looked like a real project.

![walker](../screenshot-walker.png)
