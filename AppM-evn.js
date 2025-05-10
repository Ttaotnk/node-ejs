require('dotenv').config();
const express = require('express');
const app = express();
const path = require('path');
const { title } = require('process');
const { MongoClient, ObjectId } = require('mongodb');
const color = require('ansi-colors');
const multer = require('multer');

// Load environment variables
const PORT = process.env.PORT || 5000;
const MONGODB_URI = process.env.MONGODB_URI;
const DB_NAME = process.env.DB_NAME || 'test-mongo-login';
const COLLECTION_NAME = process.env.COLLECTION_NAME || 'products';

// MongoDB connection
const client = new MongoClient(MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
});

let db, productsCollection;

async function connectToMongoDB() {
    try {
        await client.connect();
        db = client.db(DB_NAME);
        productsCollection = db.collection(COLLECTION_NAME);
        console.log('Connected to MongoDB successfully');
    } catch (err) {
        console.error('Error connecting to MongoDB:', err);
        process.exit(1);
    }
}

connectToMongoDB();

// Views setup
app.set('view engine', 'ejs');
app.use(express.static(path.join(__dirname, 'public')));

// Home.ejs
app.get('/', async (req, res) => {
    try {
        const products = await productsCollection.find().toArray();
        res.render('home', { 
            title: 'Home',
            products: products
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

// Create.ejs
app.get('/create', (req, res) => {
    res.render('create', { title: 'Create' }); 
});

// Storage
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'public/uploads/');
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + path.extname(file.originalname));
    }
});
const upload = multer({ storage });

app.post('/create', upload.single('image'), async (req, res) => {
    try {
        const { name, description } = req.body;
        const image = req.file ? req.file.filename : null;

        const newProduct = {
            name,
            description,
            image
        };

        await productsCollection.insertOne(newProduct);
        res.redirect('/');
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

// Edit.ejs
app.get('/edit/:id', async (req, res) => {
    try {
        const product = await productsCollection.findOne({ _id: new ObjectId(req.params.id) });
        res.render('edit', { 
            title: 'Edit',
            product: product 
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

app.post('/edit/:id', upload.single('image'), async (req, res) => {
    try {
        const { name, description } = req.body;
        const image = req.file ? req.file.filename : req.body.oldImage;

        await productsCollection.updateOne(
            { _id: new ObjectId(req.params.id) },
            { $set: {
                name,
                description,
                image
            }}
        );

        res.redirect('/');
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

// Delete
app.get('/delete/:id', async (req, res) => {
    try {
        await productsCollection.deleteOne({ _id: new ObjectId(req.params.id) });
        res.redirect('/');
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

// About.ejs
app.get('/about', (req, res) => {
    res.render('about', { title: 'About' }); 
});

// Contact.ejs
app.get('/contact', (req, res) => {
    res.render('contact', { title: 'Contact' }); 
});

// Server
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}...`);
    console.log(color.green.bold(`http://localhost:${PORT}`));
});

// Close MongoDB connection when app is terminated
process.on('SIGINT', async () => {
    try {
        await client.close();
        console.log('MongoDB connection closed');
        process.exit(0);
    } catch (err) {
        console.error('Error closing MongoDB connection:', err);
        process.exit(1);
    }
});