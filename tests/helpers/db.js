import mongoose from "mongoose";

const uri = () => process.env.MONGODB_URI;

export const connect = async () => {
    // Guard against wiping the development database by mistake
    if (!/test/i.test(new URL(uri()).pathname)) {
        throw new Error(`Refusing to run tests against non-test database: ${uri()}`);
    }
    await mongoose.connect(uri());
};

export const clear = async () => {
    const collections = Object.values(mongoose.connection.collections);
    await Promise.all(collections.map((collection) => collection.deleteMany({})));
};

export const disconnect = async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
};
