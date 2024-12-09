const express = require("express");
const cors = require("cors");
const axios = require("axios");
const { Product } = require("./user");

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Utility function to map month names to numbers
const getMonthNumeric = (monthName) => {
  const monthMap = {
    january: "01",
    february: "02",
    march: "03",
    april: "04",
    may: "05",
    june: "06",
    july: "07",
    august: "08",
    september: "09",
    october: "10",
    november: "11",
    december: "12",
  };
  return monthMap[monthName.toLowerCase()] || null;
};

// API: Welcome endpoint
app.get("/", (req, res) => {
  res.send("Welcome to Roxiler company assignment backend.");
});

app.get("/initialize", async (req, res) => {
    try {
      const response = await axios.get("https://s3.amazonaws.com/roxiler.com/product_transaction.json");
      const products = response.data;
  
      // Validate and prepare data before insertion
      const validatedProducts = products.map(product => {
        return {
          title: product.title,
          description: product.description,
          price: parseFloat(product.price) || 0, // Convert to number and default to 0 if invalid
          category: product.category,
          dateOfSale: product.dateOfSale,
          sold: product.sold,
        };
      }).filter(product => !isNaN(product.price)); // Filter out products with invalid price
  
      await Product.deleteMany({});
      await Product.insertMany(validatedProducts);
  
      res.status(201).json({ message: "Database initialized successfully." });
    } catch (error) {
      console.error(error.message);
      res.status(500).json({ error: "Failed to initialize the database." });
    }
  });

// API: List transactions with search and pagination
app.get("/transactions", async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const perPage = parseInt(req.query.perPage) || 10;
    const search = req.query.search?.toLowerCase() || "";
    const selectedMonth = getMonthNumeric(req.query.month || "march");

    const query = {
      $and: [
        { dateOfSale: { $regex: `^\\d{4}-${selectedMonth}-\\d{2}` } },
        {
          $or: [
            { title: { $regex: search, $options: "i" } },
            { description: { $regex: search, $options: "i" } },
            { price: { $regex: search } },
          ],
        },
      ],
    };

    const transactions = await Product.find(query)
      .skip((page - 1) * perPage)
      .limit(perPage);

    res.json({ page, perPage, transactions });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// API: Statistics for a selected month
app.get("/statistics", async (req, res) => {
  try {
    const selectedMonth = getMonthNumeric(req.query.month || "march");

    const statistics = await Product.aggregate([
      { $match: { dateOfSale: { $regex: `^\\d{4}-${selectedMonth}-\\d{2}` } } },
      {
        $group: {
          _id: null,
          totalSaleAmount: {
            $sum: { $cond: [{ $eq: ["$sold", true] }, "$price", 0] },
          },
          totalSoldItems: {
            $sum: { $cond: [{ $eq: ["$sold", true] }, 1, 0] },
          },
          totalNotSoldItems: {
            $sum: { $cond: [{ $eq: ["$sold", false] }, 1, 0] },
          },
        },
      },
    ]);

    res.json(statistics[0] || { totalSaleAmount: 0, totalSoldItems: 0, totalNotSoldItems: 0 });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// API: Bar chart data
app.get("/bar-chart", async (req, res) => {
  try {
    const selectedMonth = getMonthNumeric(req.query.month || "march");

    const barChartData = await Product.aggregate([
      { $match: { dateOfSale: { $regex: `^\\d{4}-${selectedMonth}-\\d{2}` } } },
      {
        $bucket: {
          groupBy: "$price",
          boundaries: [0, 100, 200, 300, 400, 500, 600, 700, 800, 900, Infinity],
          default: "901-above",
          output: { itemCount: { $sum: 1 } },
        },
      },
    ]);

    res.json(barChartData);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// API: Pie chart data
app.get("/pie-chart", async (req, res) => {
  try {
    const selectedMonth = getMonthNumeric(req.query.month || "march");

    const pieChartData = await Product.aggregate([
      { $match: { dateOfSale: { $regex: `^\\d{4}-${selectedMonth}-\\d{2}` } } },
      {
        $group: {
          _id: "$category",
          itemCount: { $sum: 1 },
        },
      },
    ]);

    res.json(pieChartData);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// API: Combined data from all statistics
app.get("/combined-data", async (req, res) => {
  try {
    const selectedMonth = getMonthNumeric(req.query.month || "march");
    
    const [statistics, barChartData, pieChartData] = await Promise.all([
      Product.aggregate([
        { $match: { dateOfSale: { $regex: `^\\d{4}-${selectedMonth}-\\d{2}` } } },
        {
          $group: {
            _id: null,
            totalSaleAmount: {
              $sum: { $cond: [{ $eq: ["$sold", true] }, "$price", 0] },
            },
            totalSoldItems: {
              $sum: { $cond: [{ $eq: ["$sold", true] }, 1, 0] },
            },
            totalNotSoldItems: {
              $sum: { $cond: [{ $eq: ["$sold", false] }, 1, 0] },
            },
          },
        },
      ]),
      Product.aggregate([
        { $match: { dateOfSale: { $regex: `^\\d{4}-${selectedMonth}-\\d{2}` } } },
        {
          $bucket: {
            groupBy: "$price",
            boundaries: [0, 100, 200, 300, 400, 500, 600, 700, 800, 900, Infinity],
            default: "901-above",
            output: { itemCount: { $sum: 1 } },
          },
        },
      ]),
      Product.aggregate([
        { $match: { dateOfSale: { $regex: `^\\d{4}-${selectedMonth}-\\d{2}` } } },
        {
          $group: {
            _id: "$category",
            itemCount: { $sum: 1 },
          },
        },
      ]),
    ]);

    res.json({
      statistics: statistics[0] || { totalSaleAmount: 0, totalSoldItems: 0, totalNotSoldItems: 0 },
      barChartData,
      pieChartData,
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

module.exports = app;