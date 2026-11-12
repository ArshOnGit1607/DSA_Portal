// The auth module reads BCRYPT_COST at load time; cost 4 keeps tests fast. Import this first.
process.env.BCRYPT_COST = '4';
