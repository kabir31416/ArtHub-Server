import express from "express";
import cors from "cors";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { MongoClient, ObjectId } from "mongodb";
import dotenv from 'dotenv'
dotenv.config();
const app = express();
app.use(cors());
app.use(express.json());


// SERVER 
const PORT = process.env.PORT || 5000;
app.get('/', (req, res) => {
    res.send('Wellcome to ARTHUB server');
});
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});


// DB CONECTION
const uri = process.env.MONGODB_URI;
const client = new MongoClient(uri);

let db = null;

async function getDB() {
    if (!db) {
        await client.connect();
        db = client.db("ArtHub");
        console.log("MongoDB Connected");
    }
    return db;
}


const Users = () => db.collection("user");
const Artworks = () => db.collection("artworks");
const Purchases = () => db.collection("purchases");
const Comment = () => db.collection("comments");
const Transactions = () => db.collection("transactions");


// GET ALL USERS
app.get("/api/users", async (req, res) => {
    try {
        const user = await Users().find({}).project({ password: 0 }).toArray();
        res.json(user);
    } catch (error) {
        res.status(500).json({ user_error_message: error.message });
    }
});


app.patch("/api/user/update", async (req, res) => {
    try {

        const id = req.params.id;

        const updateData = {
            ...req.body
        };

        const result = await Users().findOneAndUpdate(
            {
                _id: new ObjectId(id)
            },
            {
                $set: updateData
            },
            {
                returnDocument: "after"
            }
        );

        if (!result) {
            return res.status(404).json({
                message: "User not found"
            });
        }

        res.json(result);

    } catch (error) {
        res.status(500).json({
            message: error.message
        });
    }
});


// ART WORK API
// GET ALL ARTWORKS + SEARCH + FILTER + SORT + ARTIST EMAIL
app.get("/api/artworks", async (req, res) => {
  try {
    const {
      email,
      category,
      search,
      sort,
      minPrice,
      maxPrice,
      page = 1,
      limit = 8,
    } = req.query;

    let query = {};

    // Artist Email
    if (email) {
      query.artistEmail = email;
    }

    // Category
    if (category) {
      query.category = category;
    }

    // Search Title OR Artist Name
    if (search) {
      query.$or = [
        {
          title: {
            $regex: search,
            $options: "i",
          },
        },
        {
          artistName: {
            $regex: search,
            $options: "i",
          },
        },
      ];
    }

    // Price Range
    if (minPrice || maxPrice) {
      query.price = {};

      if (minPrice) {
        query.price.$gte = Number(minPrice);
      }

      if (maxPrice) {
        query.price.$lte = Number(maxPrice);
      }
    }

    let cursor = Artworks().find(query);

   
    if (sort === "low") {
      cursor = cursor.sort({ price: 1 });
    }

    if (sort === "high") {
      cursor = cursor.sort({ price: -1 });
    }

    if (sort === "newest") {
      cursor = cursor.sort({ createdAt: -1 });
    }

    const total = await Artworks().countDocuments(query);

    const artworks = await cursor
      .skip((page - 1) * Number(limit))
      .limit(Number(limit))
      .toArray();

    res.json({
      artworks,
      total,
      currentPage: Number(page),
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    res.status(500).json({
      message: error.message,
    });
  }
});

// FOR HOME PAGE TRENDING
app.get("/api/artworks/trending", async (req, res) => {
    try {
        const db = await getDB();

        const result = await db
            .collection("artworks")
            .find({})
            .sort({ createdAt: -1 })
            .limit(6)
            .toArray();

        res.json(result);

    } catch (error) {
        res.status(500).json({
            message: error.message
        });
    }
});

// GET SINGLE ARTWORK
app.get("/api/artworks/:id", async (req, res) => {
    try {
        const id = req.params.id;

        const result = await Artworks().findOne({
            _id: new ObjectId(id)
        });

        if (!result) {
            return res.status(404).json({
                message: "Artwork not found"
            });
        }

        res.json(result);

    } catch (error) {
        res.status(500).json({
            message: error.message
        });
    }
});

// CREATE ARTWORK
app.post("/api/artworks", async (req, res) => {
    try {

        const artwork = {
            ...req.body,
            price: Number(req.body.price),

            createdAt: new Date()
        };

        const result = await Artworks().insertOne(artwork);

        res.status(201).json({
            _id: result.insertedId,
            ...artwork
        });

    } catch (error) {
        res.status(500).json({
            message: error.message
        });
    }
});

// UPDATE ARTWORK
app.patch("/api/artworks/edit/:id", async (req, res) => {
    try {
        const id = req.params.id;
        const updateData = { ...req.body };

        if (updateData.price) {
            updateData.price = Number(updateData.price);
        }

        const result = await Artworks().findOneAndUpdate(
            { _id: new ObjectId(id) },
            { $set: updateData },
            { returnDocument: "after" }
        );

        const updatedDoc = result?.value || result;

        if (!updatedDoc) {
            return res.status(404).json({
                success: false,
                message: "Artwork not found",
            });
        }

        return res.json({
            success: true,
            data: updatedDoc, // ফ্রন্টএন্ডে এই ডেটা ব্যবহার করতে হবে
        });

    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message,
        });
    }
});

// DELETE ARTWORK
app.delete("/api/artworks/:id", async (req, res) => {
    try {

        const id = req.params.id;

        const result = await Artworks().deleteOne({
            _id: new ObjectId(id)
        });

        if (result.deletedCount === 0) {
            return res.status(404).json({
                message: "Artwork not found"
            });
        }

        res.json({
            success: true,
            message: "Artwork deleted successfully"
        });

    } catch (error) {
        res.status(500).json({
            message: error.message
        });
    }
});




//Comment

app.post("/comments", async (req, res) => {
  try {
    const {
      artId,
      userName,
      userEmail,
      userImage,
      text,
    } = req.body;

    if (!text?.trim()) {
      return res.status(400).send({
        success: false,
        message: "Comment cannot be empty",
      });
    }

    // Purchase Check
    const purchase = await Purchases().findOne({
      artworkId: artId,
      buyerEmail: userEmail,
      status: "completed",
    });

    if (!purchase) {
      return res.status(403).send({
        success: false,
        message:
          "You must purchase this artwork before commenting.",
      });
    }

    const comment = {
      artId,
      userName,
      userEmail,
      userImage,
      text,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = await Comment().insertOne(comment);

    res.status(201).send({
      success: true,
      insertedId: result.insertedId,
      message: "Comment added successfully",
    });

  } catch (error) {
    console.error("Comment Error:", error);

    res.status(500).send({
      success: false,
      message: error.message,
    });
  }
});

app.get("/comments/:artId", async (req, res) => {
  try {
    const result = await Comment()
      .find({
        artId: req.params.artId,
      })
      .sort({
        createdAt: -1,
      })
      .toArray();

    res.send(result);
  } catch (error) {
    res.status(500).send({
      success: false,
      message: error.message,
    });
  }
});

app.put("/comments/:id", async (req, res) => {
    try {
        const result = await Comment().updateOne(
            {
                _id: new ObjectId(req.params.id),
            },
            {
                $set: {
                    text: req.body.text,
                },
            }
        );

        res.send(result);
    } catch (error) {
        res.status(500).send({
            message: error.message,
        });
    }
});

app.delete("/comments/:id", async (req, res) => {
    try {
        const result = await Comment().deleteOne({
            _id: new ObjectId(req.params.id),
        });

        res.send(result);
    } catch (error) {
        res.status(500).send({
            message: error.message,
        });
    }
});




// PURCHASE
// CREATE
app.post("/api/purchase", async (req, res) => {
    try {
        const {
            artworkId,
            title,
            image,
            price,
            artistName,
            artistEmail,
            buyerName,
            buyerEmail,
            buyerImage,
        } = req.body;

        // Validate required fields
        if (!artworkId || !buyerEmail) {
            return res.status(400).json({
                success: false,
                message: "Artwork ID and Buyer Email are required",
            });
        }

        // Find user
        const user = await Users().findOne({
            email: buyerEmail,
        });

        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found",
            });
        }

        // Prevent duplicate purchase
        const existingPurchase = await Purchases().findOne({
            artworkId,
            buyerEmail,
        });

        if (existingPurchase) {
            return res.status(400).json({
                success: false,
                message: "You already purchased this artwork.",
            });
        }

        // Purchase limit check
        const maxPurchases =
            typeof user.maxPurchases === "number"
                ? user.maxPurchases
                : 3;

        const purchasedCount =
            typeof user.purchasedCount === "number"
                ? user.purchasedCount
                : 0;

        if (
            maxPurchases !== -1 &&
            purchasedCount >= maxPurchases
        ) {
            return res.status(403).json({
                success: false,
                message:
                    "Purchase limit reached. Please upgrade your subscription.",
            });
        }

        const purchase = {
            artworkId,
            title,
            image,
            price: Number(price),
            artistName,
            artistEmail,
            buyerName,
            buyerEmail,
            buyerImage,
            status: "completed",
            createdAt: new Date(),
        };

        // Save purchase
        const result = await Purchases().insertOne(purchase);

        // Increment purchase count
        await Users().updateOne(
            { email: buyerEmail },
            {
                $inc: {
                    purchasedCount: 1,
                },
            }
        );

        // Save transaction history
        await Transactions().insertOne({
            type: "purchase",
            artworkId,
            title,
            buyerEmail,
            artistEmail,
            amount: Number(price),
            createdAt: new Date(),
        });

        return res.status(201).json({
            success: true,
            message: "Purchase successful",
            insertedId: result.insertedId,
        });
    } catch (error) {
        console.error("Purchase Error:", error);

        return res.status(500).json({
            success: false,
            message: error.message,
        });
    }
});

// GET ALL PURCHASES
app.get("/api/purchase", async (req, res) => {
    try {
        const { email } = req.query;

        const query = {};

        if (email) {
            query.buyerEmail = email;
        }

        const result = await Purchases()
            .find(query)
            .sort({ createdAt: -1 })
            .toArray();

        res.json(result);

    } catch (error) {
        res.status(500).json({
            message: error.message,
        });
    }
});

//GET ARTIST SELS
app.get("/api/sales", async (req, res) => {
    try {
        const artistEmail = req.query.artistEmail;

        if (!artistEmail) {
            return res.status(400).json({
                success: false,
                message: "artistEmail is required",
            });
        }

        const sales = await Purchases()
            .find({ artistEmail })
            .sort({ createdAt: -1 })
            .toArray();

        res.status(200).json(sales);
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message,
        });
    }
});

//---------------------- Admin page -----------------------------
app.get("/api/admin/analytics", async (req, res) => {
    try {
        const totalUsers = await Users().countDocuments({
            role: "user",
        });

        const totalArtists = await Users().countDocuments({
            role: "artist",
        });

        const sales = await Purchases().find().toArray();

        const totalRevenue = sales.reduce(
            (sum, item) => sum + Number(item.price || 0),
            0
        );

        const totalArtworksSold = sales.length;

        res.send({
            totalUsers,
            totalArtists,
            totalRevenue,
            totalArtworksSold,
        });
    } catch (err) {
        res.status(500).send({
            message: err.message,
        });
    }
});

app.get("/api/admin/category-stats", async (req, res) => {
    try {
        const data = await Artworks()
            .aggregate([
                {
                    $group: {
                        _id: "$category",
                        count: { $sum: 1 },
                    },
                },
                {

                    $project: {
                        _id: 0,
                        categoryName: "$_id",
                        count: 1,
                    },
                },
            ])
            .toArray();

        res.send(data);
    } catch (err) {
        res.status(500).send({
            message: err.message,
        });
    }
});

app.get("/api/admin/sales-chart", async (req, res) => {
    try {
        const data = await Purchases()
            .aggregate([
                {
                    $group: {
                        _id: {
                            month: {
                                $month: "$createdAt",
                            },
                        },
                        revenue: {
                            $sum: "$price",
                        },
                    },
                },
                {
                    $sort: {
                        "_id.month": 1,
                    },
                },
            ])
            .toArray();

        res.send(data);
    } catch (err) {
        res.status(500).send({
            message: err.message,
        });
    }
});

app.get("/api/admin/users", async (req, res) => {
    const users = await Users()
        .find()
        .sort({ createdAt: -1 })
        .toArray();

    res.send(users);
});

app.get("/api/admin/transactions", async (req, res) => {
    try {
        const transactions = await Transactions()
            .find()
            .sort({ createdAt: -1 })
            .toArray();

        res.send(transactions);
    } catch (error) {
        res.status(500).send({
            message: error.message,
        });
    }
});

app.patch("/api/admin/users/:id/role", async (req, res) => {
    const { id } = req.params;
    const { role } = req.body;

    const result = await Users().updateOne(
        {
            _id: new ObjectId(id),
        },
        {
            $set: {
                role,
            },
        }
    );

    res.send(result);
});

app.get("/api/admin/artworks", async (req, res) => {
    const artworks = await Artworks()
        .find()
        .sort({ createdAt: -1 })
        .toArray();

    res.send(artworks);
});

app.delete("/api/admin/artworks/:id", async (req, res) => {
    const result = await Artworks().deleteOne({
        _id: new ObjectId(req.params.id),
    });

    res.send(result);
});


//SUBSCRIPTION
app.get("/api/admin/transactions", async (req, res) => {
    try {
        const purchases = await Purchases()
            .find()
            .toArray();

        const subscriptions = await Transactions()
            .find({ type: "subscription" })
            .toArray();

        const formattedPurchases = purchases.map((item) => ({
            _id: item._id,
            type: "purchase",
            email: item.buyerEmail,
            artistEmail: item.artistEmail,
            amount: Number(item.price || 0),
            plan: null,
            date: item.createdAt,
        }));

        const formattedSubscriptions = subscriptions.map((item) => ({
            _id: item._id,
            type: "subscription",
            email: item.userEmail,
            artistEmail: null,
            amount: Number(item.amount || 0),
            plan: item.tier,
            date: item.createdAt,
        }));

        const allTransactions = [
            ...formattedPurchases,
            ...formattedSubscriptions,
        ].sort(
            (a, b) => new Date(b.date) - new Date(a.date)
        );

        res.send(allTransactions);
    } catch (error) {
        res.status(500).send({
            message: error.message,
        });
    }
});

app.patch("/api/users/subscription", async (req, res) => {
    try {
        const { email, tier } = req.body;

        if (!email || !tier) {
            return res.status(400).json({
                success: false,
                message: "Email and tier are required",
            });
        }

        let maxPurchases = 3;
        let amount = 0;

        if (tier === "pro") {
            maxPurchases = 9;
            amount = 9.99;
        }

        if (tier === "premium") {
            maxPurchases = -1;
            amount = 19.99;
        }

        const result = await Users().findOneAndUpdate(
            { email },
            {
                $set: {
                    subscriptionTier: tier,
                    maxPurchases,
                    subscriptionStatus: "active",
                    subscriptionUpdatedAt: new Date(),
                },
            },
            {
                returnDocument: "after",
            }
        );

        if (!result) {
            return res.status(404).json({
                success: false,
                message: "User not found",
            });
        }

        // Save transaction
        await Transactions().insertOne({
            type: "subscription",
            userEmail: email,
            tier,
            amount,
            createdAt: new Date(),
        });

        res.json({
            success: true,
            message: `Subscription upgraded to ${tier}`,
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message,
        });
    }
});


app.patch("/api/admin/users/:id/role", async (req, res) => {
    const { id } = req.params;
    const { role } = req.body;

    const result = await Users().updateOne(
        {
            _id: new ObjectId(id),
        },
        {
            $set: {
                role,
            },
        }
    );

    res.send(result);
});


