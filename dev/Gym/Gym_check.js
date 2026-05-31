const t = Object.fromEntries(Object.entries(TranslationCore.TranslationCache).map(([a, b]) => [a, JSON.parse(b)]));

const Gym_NPCName = [];
const Gym_Pokemon = [];
const Gym_Gym = [];
const Gym_Item = [];
const Gym_Regions = [];
const Gym_Route = [];
const Gym_Town = [];

Object.entries(t.Gym.GymDefeateMessage).forEach(([rawEN, rawCN]) => {
    Object.entries(t.NPC.NPCName).forEach(([en, cn]) => {
        if (rawEN.includes(en) && !rawCN.includes(cn)) {
            Gym_NPCName.push([en, cn, rawEN, rawCN]);
        }
    });
    Object.entries(t.Pokemon).forEach(([en, cn]) => {
        if (rawEN.includes(en) && !rawCN.includes(cn)) {
            Gym_Pokemon.push([en, cn, rawEN, rawCN]);
        }
    });
    Object.entries({ ...t.Gym.GymLeaderName, ...t.Gym.GymBadge }).forEach(([en, cn]) => {
        if (rawEN.includes(en) && !rawCN.includes(cn)) {
            Gym_Gym.push([en, cn, rawEN, rawCN]);
        }
    });
    Object.entries({ ...t.Item.ItemName, ...t.ItemKeyItem }).forEach(([en, cn]) => {
        if (rawEN.includes(en) && !rawCN.includes(cn)) {
            Gym_Item.push([en, cn, rawEN, rawCN]);
        }
    });

    Object.entries({ ...t.Regions.Region, ...t.Regions.SubRegion }).forEach(([en, cn]) => {
        if (rawEN.includes(en) && !rawCN.includes(cn)) {
            Gym_Regions.push([en, cn, rawEN, rawCN]);
        }
    });
    Object.entries(t.Route).forEach(([en, cn]) => {
        if (rawEN.includes(en) && !rawCN.includes(cn)) {
            Gym_Route.push([en, cn, rawEN, rawCN]);
        }
    });
    Object.entries(t.Town).forEach(([en, cn]) => {
        if (rawEN.includes(en) && !rawCN.includes(cn)) {
            Gym_Town.push([en, cn, rawEN, rawCN]);
        }
    });
});
