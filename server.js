const express = require('express');
const db = require('./database');
const cors = require('cors');
const axios = require('axios');
const app = express();
app.use(express.json());
app.use(cors());

const PORT = 5000;

app.get('/initialize', async (request, response) => {
    try {
        const fetchData  = await axios.get('https://s3.amazonaws.com/roxiler.com/product_transaction.json');
        const data =  fetchData.data;

        db.run("DELETE FROM productTransactions", (err) => {
            if (err) {
                console.error("Error clearing old data:", err.message);
            }
        });

        const insertQuery = `
            INSERT INTO 
                productTransactions (
                    id,
                    title, 
                    description, 
                    price, 
                    category, 
                    image, 
                    sold,
                    dateOfSale
                )
            VALUES 
                (?, ?, ?, ?, ?, ?, ?, ?);
        `

        data.forEach((item) => {
            db.run(insertQuery, [
                item.id,
                item.title,
                item.description,
                item.price,
                item.category,
                item.image,
                item.sold,
                item.dateOfSale,
            ])
        });
        response.json({message: "Database initailized with transactions!"});
    } catch (err) {
        console.error("Error fetching data:", err);
        response.status(500).json({err: "Failed to fetch and store data"});
    }
})

app.get('/transactions', (request, response) => {
    const {search="", limit = 10, page = 1} = request.query;
    const offset = (page - 1) * limit;
    let searchQuery = `
        SELECT 
            * 
        FROM 
            productTransactions
        WHERE 
            title LIKE ? 
            OR description LIKE ? 
            OR category LIKE ?
            LIMIT ? OFFSET ?; 
    `
    const searchParam = `%${search}%`
    const monthFormatted = month.padStart(2, '0');
    db.all(searchQuery, [searchParam, searchParam, searchParam, limit, offset, monthFormatted], (err,rows)=> {
        if (err) {
            response.status(500).json({error: err.message});
            return;
        }
        response.json({page: Number(page), limit: Number(limit), transactions: rows});
    })
})

app.get('/statistics', (request, response) => {
    const {month} = request.query;
    if (!month || month < 1 || month > 12){
        return response.status(400).json({error: "Invalid month. Provide a value between 1 and 12."})
    }

    const totalSalesQuery = `
        SELECT 
            SUM(price) AS total_sales
        FROM 
            productTransactions
        WHERE strftime('%m', dateOfSale) = ? AND sold = 1;
    `

    const soldItemQuery = `
        SELECT 
            COUNT(*) AS sold_items
        FROM 
            productTransactions
        WHERE strftime('%m', dateOfSale) = ? AND sold = 1;
    `

    const unsoldItemQuery = `
        SELECT 
            COUNT(*) AS unsold_items
        FROM 
            productTransactions
        WHERE strftime('%m', dateOfSale) = ? AND sold = 0;
    `
    const monthFormatted = month.padStart(2, '0');

    db.get(totalSalesQuery, [monthFormatted], (err, salesResult) => {
        if (err) return response.status(500).json({error: err.message});
        db.get(soldItemQuery, [monthFormatted], (err, soldResult) => {
            if (err) return response.status(500).json({error: err.message});
            db.get(unsoldItemQuery, [monthFormatted], (err, unsoldResult) => {
                if (err) return response.status(500).json({error: err.message})

                response.json({
                    month: parseInt(month),
                    total_sales: salesResult.total_sales || 0,
                    sold_items: soldResult.sold_items || 0,
                    unsold_items: unsoldResult.unsold_items || 0,
                })
            })
        })
    })
})

app.get('/barchart', async (request, response) => {
    const {month} = request.query;
    if (!month || month < 1 || month > 12){
        return response.status(400).json({error: "Invalid month. Provide a value between 1 and 12."})
    }
    
    const barchartQuery = `
    SELECT 
        CASE 
            WHEN price BETWEEN 0 AND 100 THEN '0-100'
            WHEN price BETWEEN 101 AND 200 THEN '101-200'
            WHEN price BETWEEN 201 AND 300 THEN '201-300'
            WHEN price BETWEEN 301 AND 400 THEN '301-400'
            WHEN price BETWEEN 401 AND 500 THEN '401-500'
            WHEN price BETWEEN 501 AND 600 THEN '501-600'
            WHEN price BETWEEN 601 AND 700 THEN '601-700'
            WHEN price BETWEEN 701 AND 800 THEN '701-800'
            WHEN price BETWEEN 801 AND 900 THEN '801-900'
            ELSE '901-above'
        END AS price_range,
        COUNT(*) AS item_count
    FROM productTransactions
    WHERE strftime('%m', dateOfSale) = ? AND sold = 1
    GROUP BY price_range
    ORDER BY MIN(price);       
    `

    const monthFormatted = month.padStart(2, '0');
    
    db.all(barchartQuery, [monthFormatted], (err, rows)=> {
        if (err) return response.status(500).json({error: err.message});
        const priceRange = {
            "0-100": 0,
            "101-200": 0,
            "201-300": 0,
            "301-400": 0,
            "401-500": 0,
            "501-600": 0,
            "601-700": 0,
            "701-800": 0,
            "801-900": 0,
            "901-above": 0,
        };

        rows.forEach(row => {
            priceRange[row.price_range] = row.item_count;
        });
        response.json({month: parseInt(month), price_range: priceRange});
    });
})

app.get('/piechart', (request, response) => {
    const {month} = request.query;

    if (!month || month < 1 || month > 12){
        return response.status(400).json({error: "Invalid month. Provide a value between 1 and 12."})
    }

    const formatedMonth = month.padStart(2, "0");

    const piechartQuery = `
        SELECT category,
        COUNT(*) AS items
        FROM productTransactions
        WHERE strftime('%m', dateOfSale) = ? AND sold = 1
        GROUP BY category
        ORDER BY items DESC;
    `
    db.all(piechartQuery, [formatedMonth], (err, rows) => {
        if (err) return response.status(500).json({error: err.message});
        const categoryDistribution = {};
        rows.forEach(row => {
            categoryDistribution[row.category] = row.items;
        });
        response.json({month: parseInt(month), category_distribution: categoryDistribution})
    })

})

app.get('/summary', async (request, response) => {
    const {month} = request.query;

    if (!month || month < 1 || month > 12){
        return response.status(400).json({error: "Invalid month. Provide a value between 1 and 12."})
    }

    try {
        const [statistics, barchart, piechart] = await Promise.all([
            axios.get(`http://localhost:5000/statistics?month=${month}`).then(response => response.data),
            axios.get(`http://localhost:5000/barchart?month=${month}`).then(response => response.data),
            axios.get(`http://localhost:5000/piechart?month=${month}`).then(response => response.data)
        ]);

        const aggregatedData = {
            month: parseInt(month),
            statistics,
            price_range_distribution: barchart.price_range,
            category_distribution: piechart.category_distribution
        };
        response.json(aggregatedData);
    } catch (err) {
        response.status(500).json({error: "Failed to fetch data from APIs."});
    }
})

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});