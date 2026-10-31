package com.jvn.kingdomsheritage.network;

import com.jvn.kingdomsheritage.KingdomsHeritage;
import com.jvn.kingdomsheritage.server.SelectionManager;
import java.util.function.Consumer;
import net.minecraft.network.RegistryFriendlyByteBuf;
import net.minecraft.network.codec.StreamCodec;
import net.minecraft.network.protocol.common.custom.CustomPacketPayload;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.server.level.ServerPlayer;
import net.neoforged.neoforge.network.event.RegisterPayloadHandlersEvent;

public final class HeritageNetwork {
    public static Consumer<String> clientReceiver = json -> {};
    public static Consumer<Boolean> joinReceiver = pending -> {};

    private HeritageNetwork() {}

    public record Catalog(String json) implements CustomPacketPayload {
        public static final Type<Catalog> TYPE = new Type<>(ResourceLocation.fromNamespaceAndPath(KingdomsHeritage.MOD_ID, "catalog"));
        public static final StreamCodec<RegistryFriendlyByteBuf, Catalog> CODEC = StreamCodec.of(
                (buffer, value) -> buffer.writeUtf(value.json, 900000),
                buffer -> new Catalog(buffer.readUtf(900000)));
        @Override public Type<Catalog> type() { return TYPE; }
    }

    public record JoinState(boolean pending) implements CustomPacketPayload {
        public static final Type<JoinState> TYPE = new Type<>(ResourceLocation.fromNamespaceAndPath(KingdomsHeritage.MOD_ID, "join_state"));
        public static final StreamCodec<RegistryFriendlyByteBuf, JoinState> CODEC = StreamCodec.of(
                (buffer, value) -> buffer.writeBoolean(value.pending), buffer -> new JoinState(buffer.readBoolean()));
        @Override public Type<JoinState> type() { return TYPE; }
    }

    public record Choose(String spawn, String kit, long revision) implements CustomPacketPayload {
        public static final Type<Choose> TYPE = new Type<>(ResourceLocation.fromNamespaceAndPath(KingdomsHeritage.MOD_ID, "choose"));
        public static final StreamCodec<RegistryFriendlyByteBuf, Choose> CODEC = StreamCodec.of(
                (buffer, value) -> {
                    buffer.writeUtf(value.spawn, 256);
                    buffer.writeUtf(value.kit, 256);
                    buffer.writeLong(value.revision);
                }, buffer -> new Choose(buffer.readUtf(256), buffer.readUtf(256), buffer.readLong()));
        @Override public Type<Choose> type() { return TYPE; }
    }

    public record Review(Choose choice) implements CustomPacketPayload {
        public static final Type<Review> TYPE = new Type<>(ResourceLocation.fromNamespaceAndPath(KingdomsHeritage.MOD_ID, "review"));
        public static final StreamCodec<RegistryFriendlyByteBuf, Review> CODEC = Choose.CODEC.map(Review::new, Review::choice);
        @Override public Type<Review> type() { return TYPE; }
    }

    public record ReviewDecision(java.util.UUID token, boolean accepted) implements CustomPacketPayload {
        public static final Type<ReviewDecision> TYPE = new Type<>(ResourceLocation.fromNamespaceAndPath(KingdomsHeritage.MOD_ID, "review_decision"));
        public static final StreamCodec<RegistryFriendlyByteBuf, ReviewDecision> CODEC = StreamCodec.of(
                (buffer, value) -> { buffer.writeUUID(value.token); buffer.writeBoolean(value.accepted); },
                buffer -> new ReviewDecision(buffer.readUUID(), buffer.readBoolean()));
        @Override public Type<ReviewDecision> type() { return TYPE; }
    }

    public record FinishIntro(java.util.UUID token) implements CustomPacketPayload {
        public static final Type<FinishIntro> TYPE = new Type<>(ResourceLocation.fromNamespaceAndPath(KingdomsHeritage.MOD_ID, "finish_intro"));
        public static final StreamCodec<RegistryFriendlyByteBuf, FinishIntro> CODEC = StreamCodec.of(
                (buffer, value) -> buffer.writeUUID(value.token), buffer -> new FinishIntro(buffer.readUUID()));
        @Override public Type<FinishIntro> type() { return TYPE; }
    }

    public static void register(RegisterPayloadHandlersEvent event) {
        var registrar = event.registrar("4");
        registrar.playToServer(FinishIntro.TYPE, FinishIntro.CODEC, (packet, context) ->
                com.jvn.kingdomsheritage.server.SpawnIntro.finish((ServerPlayer) context.player(), packet.token));
        registrar.playToClient(Catalog.TYPE, Catalog.CODEC, (packet, context) -> clientReceiver.accept(packet.json));
        registrar.playToServer(Review.TYPE, Review.CODEC, (packet, context) ->
                SelectionManager.review((ServerPlayer) context.player(), packet.choice));
        registrar.playToServer(ReviewDecision.TYPE, ReviewDecision.CODEC, (packet, context) ->
                SelectionManager.reviewDecision((ServerPlayer) context.player(), packet));
        registrar.playToServer(Choose.TYPE, Choose.CODEC, (packet, context) ->
                SelectionManager.choose((ServerPlayer) context.player(), packet));
        registrar.optional().playToClient(JoinState.TYPE, JoinState.CODEC, (packet, context) -> joinReceiver.accept(packet.pending));
    }
}
