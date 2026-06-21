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
        db = client.db("Arthub");
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
const generateToken = (user) => {
    return jwt.sign(
        { id: user._id, role: user.role },
        process.env.JWT_SECRET || "default_secret",
        { expiresIn: "7d" }
    );
};

// USER API FOR OP

// REGISTER
app.post("/api/auth/register", async (req, res) => {
    try {
        const { name, email, password, role } = req.body;

        // ইমেইল চেক
        const userExists = await Users().findOne({ email });
        if (userExists) return res.status(400).json({ message: "Email already exists" });

        // পাসওয়ার্ড হ্যাশ করা
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

        // তৈরি হওয়া ইউজারের ডাটা রেসপন্স করা (পাসওয়ার্ড ছাড়া)
        const user = { _id: result.insertedId, name, email, role: newUser.role };
        const token = generateToken(user);

        res.status(201).json({ user, token });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// LOGIN
app.post("/api/auth/login", async (req, res) => {
    try {
        const { email, password } = req.body;

        const user = await Users().findOne({ email });
        if (!user) return res.status(404).json({ message: "User not found" });

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(400).json({ message: "Invalid credentials" });

        const token = generateToken(user);

        delete user.password; // সিকিউরিটির জন্য পাসওয়ার্ড বাদ দেওয়া হলো
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


// ART WORK API
// GET ALL ARTWORKS
app.get("/api/artworks", async (req, res) => {
    try {
        const data = await Artworks().find({}).toArray();
        res.json(data);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// CREATE
app.post("/api/artworks", async (req, res) => {
    try {
        const newArtwork = {
            ...req.body,
            createdAt: new Date()
        };
        const result = await Artworks().insertOne(newArtwork);
        res.status(201).json({ _id: result.insertedId, ...newArtwork });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// UPDATE
app.patch("/api/artworks/:id", async (req, res) => {
    try {
        const id = req.params.id;
        const updateData = req.body;

        const result = await Artworks().findOneAndUpdate(
            { _id: new ObjectId(id) }, // স্ট্রিং আইডিকে ObjectId-তে কনভার্ট করতে হবে
            { $set: updateData },
            { returnDocument: "after" } // আপডেট হওয়ার পরের নতুন ডাটা ব্যাক করবে
        );

        if (!result) return res.status(404).json({ message: "Artwork not found" });
        res.json(result);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// DELETE
app.delete("/api/artworks/:id", async (req, res) => {
    try {
        const id = req.params.id;
        const result = await Artworks().deleteOne({ _id: new ObjectId(id) });

        if (result.deletedCount === 0) return res.status(404).json({ message: "Artwork not found" });
        res.json({ message: "Deleted successfully" });
    } catch (error) {
        res.status(500).json({ message: error.message });
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