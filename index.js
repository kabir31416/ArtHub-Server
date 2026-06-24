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

let db;

async function connectDB() {
    try {
        await client.connect();
        db = client.db("ArtHub");
        console.log("Connected successfully to MongoDB");
    } catch (err) {
        console.error("Database connection error:", err);
    }
}
connectDB();


const Users = () => db.collection("user");
const Artworks = () => db.collection("artworks");
const Purchases = () => db.collection("purchases");
const Comment = () => db.collection("comments");


// JWT
export const generateJWT = (user) => {
    return jwt.sign(
        {
            id: user._id,
            role: user.role,
            email: user.email,
        },
        process.env.JWT_SECRET,
        { expiresIn: "7d" }
    );
};


export const verifyToken = (req, res, next) => {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
        return res.status(401).json({ message: "No token provided" });
    }

    const token = authHeader.split(" ")[1];

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded;
        next();
    } catch (err) {
        return res.status(403).json({ message: "Invalid token" });
    }
};

export const allowRoles = (...roles) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ message: "Unauthorized" });
        }
        if (!roles.includes(req.user.role)) {
            return res.status(403).json({
                message: "Access denied. Insufficient permissions",
            });
        }
        next();
    };
};



// USER API FOR OP
// REGISTER
app.post("/api/auth/sign-up", async (req, res) => {
    try {
        const { name, email, password, role } = req.body;


        const userExists = await Users().findOne({ email });
        if (userExists) return res.status(400).json({ message: "Email already exists" });


        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        const newUser = {
            name,
            email,
            password: hashedPassword,
            role: role || "user",
            createdAt: new Date()
        };

        const result = await Users().insertOne(newUser);

        const user = { _id: result.insertedId, name, email, role: newUser.role };
        const token = generateToken(user);

        res.status(201).json({ user, token });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// LOGIN
app.post("/api/auth/sign-in", async (req, res) => {
    try {
        const { email, password } = req.body;

        const user = await Users().findOne({ email });
        if (!user) return res.status(404).json({ message: "User not found" });

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(400).json({ message: "Invalid credentials" });

        const token = generateToken(user);

        delete user.password;
        res.json({ user, token });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

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
            sort
        } = req.query;

        let query = {};

        // Artist Email Filter
        if (email) {
            query.artistEmail = email;
        }

        // Category Filter
        if (category) {
            query.category = category;
        }

        // Search By Title
        if (search) {
            query.title = {
                $regex: search,
                $options: "i"
            };
        }

        let cursor = Artworks().find(query);

        // Price Sort
        if (sort === "low") {
            cursor = cursor.sort({
                price: 1
            });
        }

        if (sort === "high") {
            cursor = cursor.sort({
                price: -1
            });
        }

        const result = await cursor.toArray();

        res.status(200).json(result);

    } catch (error) {
        res.status(500).json({
            message: error.message
        });
    }
});

// FOR HOME PAGE TRENDING
app.get("/api/artworks/trending", async (req, res) => {
    try {
        const result = await Artworks()
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
        const comment = {
            artId: new ObjectId(req.body.artId),
            userName: req.body.userName,
            userEmail: req.body.userEmail,
            userImage: req.body.userImage,
            text: req.body.text,
            createdAt: new Date(),
        };

        const result = await Comment().insertOne(comment);

        res.status(201).send(result);
    } catch (error) {
        res.status(500).send({
            message: error.message,
        });
    }
});

app.get("/comments/:artId", async (req, res) => {
    try {
        const result = await Comment()
            .find({
                artId: new ObjectId(req.params.artId),
            })
            .sort({
                createdAt: -1,
            })
            .toArray();

        res.send(result);
    } catch (error) {
        res.status(500).send({
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
        const purchase = {
            artworkId: req.body.artworkId,
            title: req.body.title,
            image: req.body.image,
            price: Number(req.body.price),
            artistName: req.body.artistName,
            artistEmail: req.body.artistEmail,
            buyerName: req.body.buyerName,
            buyerEmail: req.body.buyerEmail,
            buyerImage: req.body.buyerImage,
            status: "completed",
            createdAt: new Date(),
        };
        const result = await Purchases().insertOne(purchase);
        res.status(201).json({
            success: true,
            insertedId: result.insertedId,
            purchase,
        });

    } catch (error) {
        res.status(500).json({
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
  const purchases = await Purchases()
    .find()
    .sort({ createdAt: -1 })
    .toArray();

  const transactions = purchases.map((item) => ({
    id: item._id,
    type: "purchase",
    email: item.buyerEmail,
    artistEmail: item.artistEmail,
    amount: item.price,
    date: item.createdAt,
  }));

  res.send(transactions);
});


//SUBSCRIPTION
app.get("/api/users/subscription", async (req, res) => {
    res.send('Wellcome to ARTHUB server');
})

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

        if (tier === "pro") maxPurchases = 9;
        if (tier === "premium") maxPurchases = -1;

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
                upsert: false,
            }
        );

        if (!result || !result.value) {
            return res.status(404).json({
                success: false,
                message: "User not found",
            });
        }

        return res.json({
            success: true,
            message: `Subscription upgraded to ${tier}`,
            user: result.value,
        });
    } catch (error) {
        console.log(error);

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

