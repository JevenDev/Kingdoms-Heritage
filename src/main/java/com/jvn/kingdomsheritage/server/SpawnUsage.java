package com.jvn.kingdomsheritage.server;

import com.google.gson.JsonArray;
import com.jvn.kingdomsheritage.data.HeritageCatalog;
import com.jvn.kingdomsheritage.data.HeritageException;
import com.jvn.kingdomsheritage.data.SpawnDefinition;
import net.minecraft.core.HolderLookup;
import net.minecraft.nbt.CompoundTag;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.level.saveddata.SavedData;

final class SpawnUsage extends SavedData {
    private static final Factory<SpawnUsage> FACTORY = new Factory<>(() -> new SpawnUsage(new CompoundTag()),
            (tag, registries) -> new SpawnUsage(tag.getCompound("used")));
    private final CompoundTag used;
    private long revision;

    private SpawnUsage(CompoundTag used) {
        this.used = used;
    }

    static SpawnUsage of(ServerPlayer player) {
        return player.server.overworld().getDataStorage().computeIfAbsent(FACTORY, "kingdomsheritage_spawn_usage");
    }

    @Override
    public CompoundTag save(CompoundTag tag, HolderLookup.Provider registries) {
        tag.put("used", used.copy());
        return tag;
    }

    long revision() { return revision; }

    private int remaining(SpawnDefinition spawn) {
        return Math.max(0, spawn.maxUses() - used.getInt(spawn.id().toString()));
    }

    private boolean fits(SpawnDefinition spawn, int players) {
        return spawn.maxUses() == 0 || remaining(spawn) >= players;
    }

    private boolean needsFallback(int players) {
        return HeritageCatalog.spawns().values().stream().noneMatch(spawn -> !spawn.fallbackOnly() && fits(spawn, players));
    }

    boolean available(SpawnDefinition spawn, int players) {
        return spawn != null && (spawn.fallbackOnly() ? needsFallback(players) : fits(spawn, players));
    }

    void requireAvailable(SpawnDefinition spawn, int players) {
        if (!available(spawn, players)) throw new HeritageException("spawn_capacity",
                "This location is no longer available for your group. Choose another location.");
    }

    void updateCards(JsonArray cards, int players, boolean changesOnly) {
        boolean fallback = needsFallback(players);
        var iterator = cards.iterator();
        while (iterator.hasNext()) {
            var card = iterator.next().getAsJsonObject();
            var spawn = HeritageCatalog.spawns().get(ResourceLocation.parse(card.get("id").getAsString()));
            if (spawn.fallbackOnly() && !fallback) iterator.remove();
            else {
                if (changesOnly && !spawn.fallbackOnly()) card.keySet().removeIf(key -> !key.equals("id"));
                if (spawn.maxUses() > 0) {
                    card.addProperty("remaining", remaining(spawn));
                    if (!fits(spawn, players)) card.addProperty("requires_slots", players);
                }
            }
        }
    }

    void consume(SpawnDefinition spawn, int arrivals) {
        if (spawn.maxUses() == 0) return;
        String id = spawn.id().toString();
        used.putInt(id, Math.addExact(used.getInt(id), arrivals));
        setDirty();
        revision++;
    }
}
