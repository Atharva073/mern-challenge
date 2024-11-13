// backend/routes/api.js
const express = require('express');
const axios = require('axios');
const Product = require('../models/Product');
const router = express.Router();

const getDateRange = (month) => {
    const months = {
        January: 0, February: 1, March: 2, April: 3,
        May: 4, June: 5, July: 6, August: 7,
        September: 8, October: 9, November: 10, December: 11,
    };
    const year = new Date().getFullYear();
    const start = new Date(year, months[month], 1);
    const end = new Date(year, months[month] + 1, 1);
    return { start, end };
};

// Seed the database
router.get('/initialize', async (req, res) => {
    try {
        const { data } = await axios.get('https://s3.amazonaws.com/roxiler.com/product_transaction.json');
        await Product.insertMany(data);
        res.json({ message: 'Database initialized successfully' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to initialize database' });
    }
});

// Transactions API
router.get('/transactions', async (req, res) => {
    const { page = 1, perPage = 10, search = '', month } = req.query;
    const regex = new RegExp(search, 'i');
    const { start, end } = getDateRange(month);

    const query = {
        dateOfSale: { $gte: start, $lt: end },
        $or: [
            { title: regex },
            { description: regex },
            ...(isNaN(search) ? [] : [{ price: Number(search) }]),
        ],
    };

    const transactions = await Product.find(query)
        .skip((page - 1) * perPage)
        .limit(parseInt(perPage));

    res.json(transactions);
});

// Statistics API
router.get('/statistics', async (req, res) => {
    const { month } = req.query;
    const { start, end } = getDateRange(month);

    const totalSaleAmount = await Product.aggregate([
        { $match: { dateOfSale: { $gte: start, $lt: end } } },
        { $group: { _id: null, total: { $sum: '$price' } } },
    ]);

    const totalSoldItems = await Product.countDocuments({ sold: true, dateOfSale: { $gte: start, $lt: end } });
    const totalNotSoldItems = await Product.countDocuments({ sold: false, dateOfSale: { $gte: start, $lt: end } });

    res.json({
        totalSaleAmount: totalSaleAmount[0]?.total || 0,
        totalSoldItems,
        totalNotSoldItems,
    });
});

// Bar Chart API
router.get('/bar-chart', async (req, res) => {
    const { month } = req.query;
    const { start, end } = getDateRange(month);

    const priceRanges = await Product.aggregate([
        { $match: { dateOfSale: { $gte: start, $lt: end } } },
        {
            $bucket: {
                groupBy: "$price",
            boundaries: [0, 100, 200, 300, 400, 500, 600, 700, 800, 900, Infinity],
                default: "901-above",
                output: { count: { $sum: 1 } },
            },
        },
    ]);

    res.json(priceRanges);
});

// Pie Chart API
router.get('/pie-chart', async (req, res) => {
    const { month } = req.query;
    const { start, end } = getDateRange(month);

    const categories = await Product.aggregate([
        { $match: { dateOfSale: { $gte: start, $lt: end } } },
        {
            $group: {
                _id: "$category",
                count: { $sum: 1 },
            },
        },
    ]);

    res.json(categories);
});

module.exports = router;
