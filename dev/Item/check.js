function getGetterOwnerNames(obj, key) {
    const owners = [];

    let proto = obj;
    while (proto) {
        const desc = Object.getOwnPropertyDescriptor(proto, key);

        if (desc?.get) {
            owners.push(proto.constructor.name);
        }

        proto = Object.getPrototypeOf(proto);
    }

    return owners;
}

[
    ...new Set(
        Object.values(ItemList)
            .map((i) => getGetterOwnerNames(i, "displayName"))
            .flat()
    ),
].toString() == "Item,PokemonItem";

[
    ...new Set(
        Object.values(ItemList)
            .map((i) => getGetterOwnerNames(i, "description"))
            .flat()
    ),
].toString() == "Item,BerryItem,BuyKeyItem,PokeBlock,MegaStoneItem,ChristmasPresent,FarmHandItem,HatcheryHelperItem";
