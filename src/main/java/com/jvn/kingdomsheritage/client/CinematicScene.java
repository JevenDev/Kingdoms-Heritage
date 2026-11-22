package com.jvn.kingdomsheritage.client;

import com.jvn.kingdomsheritage.data.IntroScene;
import com.mojang.blaze3d.vertex.PoseStack;
import com.mojang.math.Axis;
import java.util.List;
import net.minecraft.client.CameraType;
import net.minecraft.client.Minecraft;
import net.minecraft.client.model.PlayerModel;
import net.minecraft.client.model.geom.ModelPart;
import net.minecraft.client.model.geom.builders.CubeDeformation;
import net.minecraft.client.model.geom.builders.LayerDefinition;
import net.minecraft.client.player.LocalPlayer;
import net.minecraft.client.renderer.MultiBufferSource;
import net.minecraft.client.renderer.RenderType;
import net.minecraft.client.renderer.texture.OverlayTexture;
import net.minecraft.client.resources.PlayerSkin;
import net.minecraft.util.Mth;
import net.minecraft.world.entity.player.PlayerModelPart;
import net.minecraft.world.level.ClipContext;
import net.minecraft.world.phys.HitResult;
import net.minecraft.world.phys.Vec3;
import org.joml.Quaternionf;

final class CinematicScene {
    private record Arms(ModelPart leftArm, ModelPart leftSleeve, ModelPart rightArm, ModelPart rightSleeve) {
        private Arms(boolean slim) {
            this(LayerDefinition.create(PlayerModel.createMesh(CubeDeformation.NONE, slim), 64, 64).bakeRoot());
        }

        private Arms(ModelPart model) {
            this(model.getChild("left_arm"), model.getChild("left_sleeve"), model.getChild("right_arm"), model.getChild("right_sleeve"));
            for (ModelPart part : new ModelPart[]{leftArm, leftSleeve, rightArm, rightSleeve}) part.setPos(0, 0, 0);
        }
    }

    private static final Arms WIDE = new Arms(false);
    private static final Arms SLIM = new Arms(true);
    private static final float PIXEL = 1F / 16;
    private final IntroScene scene;
    private final SceneClip clip;
    private int nextWait;
    private boolean waiting;
    private CameraType previousCameraType;
    private CameraType sceneCameraType;
    private Vec3 cameraOffset = Vec3.ZERO;
    private final Quaternionf viewFromRig = new Quaternionf();

    CinematicScene(IntroScene scene, SceneClip clip) {
        this.scene = scene;
        this.clip = clip;
    }

    void start(Minecraft minecraft) {
        previousCameraType = minecraft.options.getCameraType();
        sceneCameraType = cameraType(scene.perspective());
        minecraft.options.setCameraType(sceneCameraType);
    }

    void clear(Minecraft minecraft, boolean completed) {
        if (previousCameraType != null) {
            minecraft.options.setCameraType(completed ? cameraType(scene.exitPerspective()) : previousCameraType);
        }
    }

    private CameraType cameraType(IntroScene.Perspective perspective) {
        return switch (perspective) {
            case FIRST_PERSON -> CameraType.FIRST_PERSON;
            case THIRD_PERSON_BACK -> CameraType.THIRD_PERSON_BACK;
            case THIRD_PERSON_FRONT -> CameraType.THIRD_PERSON_FRONT;
            case PREVIOUS -> previousCameraType;
        };
    }

    boolean firstPerson() { return sceneCameraType.isFirstPerson(); }

    boolean waiting() { return waiting; }

    boolean reachWait(int age) {
        if (nextWait >= scene.waitAtTicks().size() || age != scene.waitAtTicks().get(nextWait)) return false;
        waiting = true;
        return true;
    }

    void resume() {
        waiting = false;
        nextWait++;
    }

    float elapsed(int age, float partialTick) {
        if (waiting) return age;
        float next = nextWait < scene.waitAtTicks().size() ? scene.waitAtTicks().get(nextWait) : scene.durationTicks();
        return Math.min(age + partialTick, Math.max(age, next));
    }

    SpawnIntroOverlay.CameraPose camera(LocalPlayer player, Vec3 eye, float yaw, float pitch, float roll, float ticks) {
        var camera = clip.camera().sample(ticks);
        float transition = Math.min(6F, scene.durationTicks());
        float handoff = Mth.clamp((ticks - scene.durationTicks() + transition) / transition, 0F, 1F);
        var rigToWorld = new Quaternionf().rotationY(Mth.PI - yaw * Mth.DEG_TO_RAD);
        var offset = rigPosition(camera.position()).scale(1 - handoff);
        Vec3 target = eye.add(new Vec3(offset.toVector3f().rotate(rigToWorld)));
        var hit = player.level().clip(new ClipContext(eye, target, ClipContext.Block.VISUAL, ClipContext.Fluid.NONE, player));
        if (hit.getType() != HitResult.Type.MISS) {
            Vec3 direction = target.subtract(eye).normalize();
            target = eye.add(direction.scale(Math.max(0, eye.distanceTo(hit.getLocation()) - 0.08)));
        }
        cameraOffset = new Vec3(target.subtract(eye).toVector3f().rotate(rigToWorld.conjugate()));

        var rotation = camera.rotation();
        float yawOffset = (float) rotation.y * (1 - handoff);
        float scenePitch = clip.camera().rotates() ? Mth.lerp(handoff, (float) rotation.x, pitch) : pitch;
        float sceneRoll = clip.camera().rotates() ? Mth.lerp(handoff, (float) -rotation.z, roll) : roll;
        viewFromRig.rotationYXZ(-yawOffset * Mth.DEG_TO_RAD, -scenePitch * Mth.DEG_TO_RAD, -sceneRoll * Mth.DEG_TO_RAD).conjugate();
        return new SpawnIntroOverlay.CameraPose(target, yaw + yawOffset, scenePitch, sceneRoll);
    }

    void renderArms(float ticks, PoseStack poses, MultiBufferSource.BufferSource buffer, LocalPlayer player, int light) {
        if (ticks >= scene.durationTicks() || player.isInvisible()) return;
        PlayerSkin skin = player.getSkin();
        Arms arms = skin.model() == PlayerSkin.Model.SLIM ? SLIM : WIDE;
        poses.pushPose();
        poses.mulPose(viewFromRig);
        poses.translate(-cameraOffset.x, -cameraOffset.y, -cameraOffset.z);
        renderArm(poses, buffer, skin, light, clip.leftArm().sample(ticks), -5, arms.leftArm,
                player.isModelPartShown(PlayerModelPart.LEFT_SLEEVE) ? arms.leftSleeve : null);
        renderArm(poses, buffer, skin, light, clip.rightArm().sample(ticks), 5, arms.rightArm,
                player.isModelPartShown(PlayerModelPart.RIGHT_SLEEVE) ? arms.rightSleeve : null);
        poses.popPose();
        buffer.endBatch();
    }

    private static void renderArm(PoseStack poses, MultiBufferSource buffer, PlayerSkin skin, int light, SceneClip.Pose pose,
                                  int shoulderX, ModelPart arm, ModelPart sleeve) {
        poses.pushPose();
        Vec3 pivot = rigPosition(pose.position()).add(shoulderX * PIXEL, -4 * PIXEL, -3 * PIXEL);
        poses.translate(pivot.x, pivot.y, pivot.z);
        Vec3 rotation = pose.rotation();
        poses.mulPose(new Quaternionf().rotationZYX((float) rotation.z * Mth.DEG_TO_RAD,
                (float) -rotation.y * Mth.DEG_TO_RAD, (float) -rotation.x * Mth.DEG_TO_RAD));
        poses.mulPose(Axis.ZP.rotationDegrees(180));
        arm.render(poses, buffer.getBuffer(RenderType.entitySolid(skin.texture())), light, OverlayTexture.NO_OVERLAY);
        if (sleeve != null) {
            sleeve.render(poses, buffer.getBuffer(RenderType.entityTranslucent(skin.texture())), light, OverlayTexture.NO_OVERLAY);
        }
        poses.popPose();
    }

    void posePlayer(PlayerModel<?> model, float ticks, List<Runnable> restore) {
        posePart(clip.head(), ticks, model.head, model.hat, restore);
        posePart(clip.body(), ticks, model.body, model.jacket, restore);
        posePart(clip.leftArm(), ticks, model.leftArm, model.leftSleeve, restore);
        posePart(clip.rightArm(), ticks, model.rightArm, model.rightSleeve, restore);
        posePart(clip.leftLeg(), ticks, model.leftLeg, model.leftPants, restore);
        posePart(clip.rightLeg(), ticks, model.rightLeg, model.rightPants, restore);
    }

    private static void posePart(SceneClip.Track track, float ticks, ModelPart part, ModelPart outer, List<Runnable> restore) {
        if (!track.animated()) return;
        savePose(part, restore);
        savePose(outer, restore);
        var base = part.getInitialPose();
        var pose = track.sample(ticks);
        Vec3 position = pose.position();
        Vec3 rotation = pose.rotation();
        part.setPos(base.x + (float) position.x, base.y - (float) position.y, base.z + (float) position.z);
        part.setRotation(base.xRot + (float) rotation.x * Mth.DEG_TO_RAD, base.yRot + (float) rotation.y * Mth.DEG_TO_RAD,
                base.zRot + (float) rotation.z * Mth.DEG_TO_RAD);
        outer.setPos(part.x, part.y, part.z);
        outer.setRotation(part.xRot, part.yRot, part.zRot);
    }

    private static void savePose(ModelPart part, List<Runnable> restore) {
        var original = part.storePose();
        restore.add(() -> {
            part.setPos(original.x, original.y, original.z);
            part.setRotation(original.xRot, original.yRot, original.zRot);
        });
    }

    private static Vec3 rigPosition(Vec3 position) {
        // blockbench mirrors x in bedrock exports
        return new Vec3(-position.x * PIXEL, position.y * PIXEL, position.z * PIXEL);
    }
}
