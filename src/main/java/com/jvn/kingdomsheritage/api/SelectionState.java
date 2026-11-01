package com.jvn.kingdomsheritage.api;

import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import net.minecraft.resources.ResourceLocation;

public record SelectionState(UUID sessionId, long revision, Optional<ResourceLocation> spawnId,
                             Optional<ResourceLocation> kitId, Optional<UUID> leader, Set<UUID> members) {
    public SelectionState {
        Objects.requireNonNull(sessionId, "sessionId");
        Objects.requireNonNull(spawnId, "spawnId");
        Objects.requireNonNull(kitId, "kitId");
        Objects.requireNonNull(leader, "leader");
        members = Set.copyOf(members);
    }

    public SelectionState choices(long revision, ResourceLocation spawn, ResourceLocation kit) {
        return new SelectionState(sessionId, revision, Optional.ofNullable(spawn), Optional.ofNullable(kit), leader, members);
    }

    public SelectionState party(UUID leader, Set<UUID> members) {
        return new SelectionState(sessionId, revision, spawnId, kitId, Optional.ofNullable(leader), members);
    }
}
