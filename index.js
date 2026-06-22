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


const Users = () => db.collection("users");
const Artworks = () => db.collection("artworks");
const Purchases = () => db.collection("purchases");


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
        const users = await Users().find({}).project({ password: 0 }).toArray();
        res.json(users);
    } catch (error) {
        res.status(500).json({ message: error.message });
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

            // price number হিসেবে save হবে
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
app.patch("/api/artworks/:id", async (req, res) => {
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

        if (!result?.value) {
            return res.status(404).json({
                success: false,
                message: "Artwork not found",
            });
        }

        return res.json({
            success: true,
            data: result.value,
        });

    } catch (error) {
        res.status(500).json({
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

// PURCHASE
// CREATE
app.post("/api/purchase", async (req, res) => {
    try {
        const newPurchase = {
            ...req.body,
            createdAt: new Date()
        };
        const result = await Purchases().insertOne(newPurchase);
        res.status(201).json({ _id: result.insertedId, ...newPurchase });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// GET ALL PURCHASES
app.get("/api/purchase", async (req, res) => {
    try {
        const data = await Purchases().find({}).toArray();
        res.json(data);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});




// SERVER 
const PORT = process.env.PORT || 5000;

app.get('/', (req, res) => {
    res.send('Wellcome to ARTHUB server');
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});