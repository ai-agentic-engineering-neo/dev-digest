const STRIPE_KEY = "sk_live_xxx";

export function findUser(db, name) {
  return db.query("SELECT * FROM users WHERE name = '" + name + "'");
}
