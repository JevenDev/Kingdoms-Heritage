package com.jvn.kingdomsheritage.network;

import com.jvn.kingdomsheritage.KingdomsHeritage;
import com.jvn.kingdomsheritage.server.SelectionManager;
import com.jvn.kingdomsheritage.data.CatalogPayload;
import com.jvn.kingdomsheritage.data.KitShop;
import java.util.ArrayList;
import java.util.List;
import java.util.function.Consumer;
import net.minecraft.network.RegistryFriendlyByteBuf;
import net.minecraft.network.codec.StreamCodec;
import net.minecraft.network.protocol.common.custom.CustomPacketPayload;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.server.level.ServerPlayer;
import net.neoforged.neoforge.network.event.RegisterPayloadHandlersEvent;

public final class HeritageNetwork {
    public static final int MAX_PARTY_SIZE = 8;
    public static Consumer<String> clientReceiver = json -> {};
    public static Consumer<Cursor> cursorReceiver = cursor -> {};
    public static Consumer<Boolean> joinReceiver = pending -> {};

    private HeritageNetwork() {}

    public record Catalog(String json) implements CustomPacketPayload {
        public static final Type<Catalog> TYPE = new Type<>(ResourceLocation.fromNamespaceAndPath(KingdomsHeritage.MOD_ID, "catalog"));
        public static final StreamCodec<RegistryFriendlyByteBuf, Catalog> CODEC = StreamCodec.of(
                (buffer, value) -> buffer.writeUtf(value.json, CatalogPayload.MAX_BYTES),
                buffer -> new Catalog(buffer.readUtf(CatalogPayload.MAX_BYTES)));
        @Override public Type<Catalog> type() { return TYPE; }
    }

    public record JoinState(boolean pending) implements CustomPacketPayload {
        public static final Type<JoinState> TYPE = new Type<>(ResourceLocation.fromNamespaceAndPath(KingdomsHeritage.MOD_ID, "join_state"));
        public static final StreamCodec<RegistryFriendlyByteBuf, JoinState> CODEC = StreamCodec.of(
                (buffer, value) -> buffer.writeBoolean(value.pending), buffer -> new JoinState(buffer.readBoolean()));
        @Override public Type<JoinState> type() { return TYPE; }
    }

    public record Review(String spawn, String kit, long revision, List<KitShop.Pick> offers) implements CustomPacketPayload {
        public Review {
            offers = List.copyOf(offers);
            if (offers.size() > KitShop.MAX_PICKS) throw new IllegalArgumentException("Too many starter kit offers");
        }

        public static final Type<Review> TYPE = new Type<>(ResourceLocation.fromNamespaceAndPath(KingdomsHeritage.MOD_ID, "review"));
        public static final StreamCodec<RegistryFriendlyByteBuf, Review> CODEC = StreamCodec.of(
                (buffer, value) -> {
                    buffer.writeUtf(value.spawn, 256);
                    buffer.writeUtf(value.kit, 256);
                    buffer.writeLong(value.revision);
                    buffer.writeVarInt(value.offers.size());
                    for (var pick : value.offers) {
                        buffer.writeVarInt(pick.offer());
                        buffer.writeVarInt(pick.slot());
                    }
                }, buffer -> {
                    String spawn = buffer.readUtf(256);
                    String kit = buffer.readUtf(256);
                    long revision = buffer.readLong();
                    int count = buffer.readVarInt();
                    if (count < 0 || count > KitShop.MAX_PICKS) throw new io.netty.handler.codec.DecoderException("Invalid starter kit offer count");
                    var offers = new ArrayList<KitShop.Pick>(count);
                    for (int index = 0; index < count; index++) offers.add(new KitShop.Pick(buffer.readVarInt(), buffer.readVarInt()));
                    return new Review(spawn, kit, revision, offers);
                });
        @Override public Type<Review> type() { return TYPE; }
    }

    public record ReviewDecision(java.util.UUID token, boolean accepted) implements CustomPacketPayload {
        public static final Type<ReviewDecision> TYPE = new Type<>(ResourceLocation.fromNamespaceAndPath(KingdomsHeritage.MOD_ID, "review_decision"));
        public static final StreamCodec<RegistryFriendlyByteBuf, ReviewDecision> CODEC = StreamCodec.of(
                (buffer, value) -> { buffer.writeUUID(value.token); buffer.writeBoolean(value.accepted); },
                buffer -> new ReviewDecision(buffer.readUUID(), buffer.readBoolean()));
        @Override public Type<ReviewDecision> type() { return TYPE; }
    }

    public record IntroReady(java.util.UUID token, int durationTicks) implements CustomPacketPayload {
        public static final Type<IntroReady> TYPE = new Type<>(ResourceLocation.fromNamespaceAndPath(KingdomsHeritage.MOD_ID, "intro_ready"));
        public static final StreamCodec<RegistryFriendlyByteBuf, IntroReady> CODEC = StreamCodec.of(
                (buffer, value) -> { buffer.writeUUID(value.token); buffer.writeVarInt(value.durationTicks); },
                buffer -> new IntroReady(buffer.readUUID(), buffer.readVarInt()));
        @Override public Type<IntroReady> type() { return TYPE; }
    }

    public record FinishIntro(java.util.UUID token) implements CustomPacketPayload {
        public static final Type<FinishIntro> TYPE = new Type<>(ResourceLocation.fromNamespaceAndPath(KingdomsHeritage.MOD_ID, "finish_intro"));
        public static final StreamCodec<RegistryFriendlyByteBuf, FinishIntro> CODEC = StreamCodec.of(
                (buffer, value) -> buffer.writeUUID(value.token), buffer -> new FinishIntro(buffer.readUUID()));
        @Override public Type<FinishIntro> type() { return TYPE; }
    }

    public record PartyAction(int action, java.util.UUID target, String spawn, long revision) implements CustomPacketPayload {
        public static final int INVITE = 0, ACCEPT = 1, DECLINE = 2, LEAVE = 3, SELECT = 4, SUGGEST = 5, STAGE = 6, KIT = 7;
        public static final Type<PartyAction> TYPE = new Type<>(ResourceLocation.fromNamespaceAndPath(KingdomsHeritage.MOD_ID, "party_action"));
        public static final StreamCodec<RegistryFriendlyByteBuf, PartyAction> CODEC = StreamCodec.of(
                (buffer, value) -> {
                    buffer.writeByte(value.action);
                    buffer.writeUUID(value.target);
                    buffer.writeUtf(value.spawn, 256);
                    buffer.writeLong(value.revision);
                }, buffer -> new PartyAction(buffer.readUnsignedByte(), buffer.readUUID(), buffer.readUtf(256), buffer.readLong()));
        @Override public Type<PartyAction> type() { return TYPE; }
    }

    public record Cursor(java.util.UUID player, int x, int y, int page) implements CustomPacketPayload {
        public static final Type<Cursor> TYPE = new Type<>(ResourceLocation.fromNamespaceAndPath(KingdomsHeritage.MOD_ID, "cursor"));
        public static final StreamCodec<RegistryFriendlyByteBuf, Cursor> CODEC = StreamCodec.of(
                (buffer, value) -> {
                    buffer.writeUUID(value.player);
                    buffer.writeShort(value.x);
                    buffer.writeShort(value.y);
                    buffer.writeVarInt(value.page);
                }, buffer -> new Cursor(buffer.readUUID(), buffer.readUnsignedShort(), buffer.readUnsignedShort(), buffer.readVarInt()));
        @Override public Type<Cursor> type() { return TYPE; }
    }

    public record FlowAction(java.util.UUID session, java.util.UUID token, long revision, ResourceLocation step,
                             int action, String spawn, String kit, String value, long version) implements CustomPacketPayload {
        public static final int ENTER = 0, SUBMIT = 1, BACK = 2, SKIP = 3, NAVIGATE = 4;
        public static final Type<FlowAction> TYPE = new Type<>(ResourceLocation.fromNamespaceAndPath(KingdomsHeritage.MOD_ID, "flow_action"));
        public static final StreamCodec<RegistryFriendlyByteBuf, FlowAction> CODEC = StreamCodec.of(
                (buffer, value) -> {
                    buffer.writeUUID(value.session);
                    buffer.writeUUID(value.token);
                    buffer.writeLong(value.revision);
                    buffer.writeResourceLocation(value.step);
                    buffer.writeByte(value.action);
                    buffer.writeUtf(value.spawn, 256);
                    buffer.writeUtf(value.kit, 256);
                    buffer.writeUtf(value.value, 16384);
                    buffer.writeLong(value.version);
                }, buffer -> new FlowAction(buffer.readUUID(), buffer.readUUID(), buffer.readLong(), buffer.readResourceLocation(),
                        buffer.readUnsignedByte(), buffer.readUtf(256), buffer.readUtf(256), buffer.readUtf(16384), buffer.readLong()));
        @Override public Type<FlowAction> type() { return TYPE; }
    }

    public static void register(RegisterPayloadHandlersEvent event) {
        var registrar = event.registrar("12");
        registrar.playToServer(IntroReady.TYPE, IntroReady.CODEC, (packet, context) ->
                com.jvn.kingdomsheritage.server.SpawnIntro.ready((ServerPlayer) context.player(), packet.token, packet.durationTicks));
        registrar.playToServer(FlowAction.TYPE, FlowAction.CODEC, (packet, context) ->
                com.jvn.kingdomsheritage.server.SelectionSteps.action((ServerPlayer) context.player(), packet));
        registrar.playToServer(PartyAction.TYPE, PartyAction.CODEC, (packet, context) ->
                com.jvn.kingdomsheritage.server.SelectionParty.action((ServerPlayer) context.player(), packet));
        registrar.playBidirectional(Cursor.TYPE, Cursor.CODEC, (packet, context) -> {
            if (context.player() instanceof ServerPlayer player) com.jvn.kingdomsheritage.server.SelectionParty.cursor(player, packet);
            else cursorReceiver.accept(packet);
        });
        registrar.playToServer(FinishIntro.TYPE, FinishIntro.CODEC, (packet, context) ->
                com.jvn.kingdomsheritage.server.SpawnIntro.finish((ServerPlayer) context.player(), packet.token));
        registrar.playToClient(Catalog.TYPE, Catalog.CODEC, (packet, context) -> clientReceiver.accept(packet.json));
        registrar.playToServer(Review.TYPE, Review.CODEC, (packet, context) ->
                SelectionManager.review((ServerPlayer) context.player(), packet));
        registrar.playToServer(ReviewDecision.TYPE, ReviewDecision.CODEC, (packet, context) ->
                SelectionManager.reviewDecision((ServerPlayer) context.player(), packet));
        registrar.optional().playToClient(JoinState.TYPE, JoinState.CODEC, (packet, context) -> joinReceiver.accept(packet.pending));
    }
}
