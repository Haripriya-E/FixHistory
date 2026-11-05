import mongoose from 'mongoose';

mongoose.set('strictQuery', true);

/** Connects to MongoDB. Throws a descriptive error when the database cannot be reached. */
export async function connectDB(uri) {
  try {
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 10_000 });
  } catch (error) {
    const hint = uri.startsWith('mongodb+srv://')
      ? 'Check the Atlas username/password, that your IP address is allowed under "Network Access", and that the cluster is running.'
      : 'Check that the MongoDB service is running on this computer (see README > Troubleshooting).';
    const wrapped = new Error(`Could not connect to MongoDB. ${hint}\nDetails: ${error.message}`);
    wrapped.cause = error;
    throw wrapped;
  }
  const { host, name } = mongoose.connection;
  return { host, name };
}

export async function disconnectDB() {
  await mongoose.disconnect();
}

/** Masks the password part of a connection string so it can be logged safely. */
export function maskMongoUri(uri) {
  return uri.replace(/\/\/([^:/@]+):([^@]+)@/, '//$1:****@');
}
