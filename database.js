const sqlite3 = require('sqlite3').verbose();

const db = new sqlite3.Database("./database.db", (err) => {
    if (err) {
        console.error("Error opening database:", err.message);
    } else {
        console.log("Connected to Sql database");
    }
});

db.run(`
    CREATE TABLE IF NOT EXISTS productTransactions (
        id INTEGER PRIMARY KEY,
        title VARCHAR,
        description TEXT,
        price REAL,
        category TEXT,
        image TEXT,
        sold BOOLEAN,
        dateOfSale DATE
    )
`);
module.exports = db;