const user = require('./models/user.js');
const lazy = require(process.env.MODULE);

module.exports = { user, lazy };
