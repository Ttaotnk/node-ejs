require('dotenv').config();
const express = require('express');
const app = express();
const path = require('path');
const { MongoClient, ObjectId } = require('mongodb');
const color = require('ansi-colors');
const multer = require('multer');
const fs = require('fs');

// ตรวจสอบและสร้างโฟลเดอร์ uploads ถ้าไม่มี
const uploadDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// การตั้งค่า environment variables
const PORT = process.env.PORT ;
const MONGODB_URI = process.env.MONGODB_URI ;
const DB_NAME = process.env.DB_NAME;
const COLLECTION_NAME = process.env.COLLECTION_NAME ;

// เชื่อมต่อ MongoDB
const client = new MongoClient(MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

let db, productsCollection;

async function connectToMongoDB() {
  try {
    await client.connect();
    db = client.db(DB_NAME);
    productsCollection = db.collection(COLLECTION_NAME);
    console.log(color.green('✓ Connected to MongoDB successfully'));
  } catch (err) {
    console.error(color.red('✗ Error connecting to MongoDB:'), err);
    process.exit(1);
  }
}

connectToMongoDB();

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ตั้งค่า View Engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// การตั้งค่า Multer สำหรับอัพโหลดไฟล์
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(
      null,
      file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname)
    );
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    const filetypes = /jpeg|jpg|png|gif/;
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = filetypes.test(file.mimetype);

    if (extname && mimetype) {
      return cb(null, true);
    } else {
      cb(new Error('Error: Images Only!'));
    }
  },
}).single('image');

// Routes
app.get('/', async (req, res) => {
  try {
    const products = await productsCollection.find().sort({ _id: -1 }).toArray();
    res.render('home', {
      title: 'หน้าหลัก',
      products: products,
    });
  } catch (err) {
    console.error(err);
    res.status(500).render('error', { error: 'เกิดข้อผิดพลาดในการโหลดข้อมูล' });
  }
});

app.get('/create', (req, res) => {
  res.render('create', { title: 'เพิ่มสินค้า' });
});

app.post('/create', (req, res) => {
  upload(req, res, async (err) => {
    try {
      if (err) {
        return res.status(400).render('create', {
          title: 'เพิ่มสินค้า',
          error: err.message,
        });
      }

      const { name, description } = req.body;
      const image = req.file ? req.file.filename : null;

      if (!name || !description) {
        // ลบไฟล์ที่อัพโหลดแล้วถ้ามี
        if (req.file) fs.unlinkSync(path.join(uploadDir, req.file.filename));
        return res.status(400).render('create', {
          title: 'เพิ่มสินค้า',
          error: 'กรุณากรอกข้อมูลให้ครบถ้วน',
        });
      }

      const newProduct = {
        name,
        description,
        image,
        createdAt: new Date(),
      };

      await productsCollection.insertOne(newProduct);
      res.redirect('/');
    } catch (err) {
      console.error(err);
      if (req.file) fs.unlinkSync(path.join(uploadDir, req.file.filename));
      res.status(500).render('error', { error: 'เกิดข้อผิดพลาดในการสร้างสินค้า' });
    }
  });
});

app.get('/edit/:id', async (req, res) => {
  try {
    if (!ObjectId.isValid(req.params.id)) {
      return res.status(404).render('error', { error: 'ไม่พบสินค้านี้' });
    }

    const product = await productsCollection.findOne({
      _id: new ObjectId(req.params.id),
    });

    if (!product) {
      return res.status(404).render('error', { error: 'ไม่พบสินค้านี้' });
    }

    res.render('edit', {
      title: 'แก้ไขสินค้า',
      product: product,
    });
  } catch (err) {
    console.error(err);
    res.status(500).render('error', { error: 'เกิดข้อผิดพลาดในการโหลดข้อมูล' });
  }
});

app.post('/edit/:id', (req, res) => {
  upload(req, res, async (err) => {
    try {
      if (!ObjectId.isValid(req.params.id)) {
        return res.status(404).render('error', { error: 'ไม่พบสินค้านี้' });
      }

      if (err) {
        return res.status(400).render('edit', {
          title: 'แก้ไขสินค้า',
          product: req.body,
          error: err.message,
        });
      }

      const { name, description, oldImage } = req.body;
      const image = req.file ? req.file.filename : oldImage || null;

      if (!name || !description) {
        if (req.file) fs.unlinkSync(path.join(uploadDir, req.file.filename));
        return res.status(400).render('edit', {
          title: 'แก้ไขสินค้า',
          product: { ...req.body, _id: req.params.id },
          error: 'กรุณากรอกข้อมูลให้ครบถ้วน',
        });
      }

      const updatedProduct = {
        name,
        description,
        image,
        updatedAt: new Date(),
      };

      const result = await productsCollection.updateOne(
        { _id: new ObjectId(req.params.id) },
        { $set: updatedProduct }
      );

      if (result.matchedCount === 0) {
        if (req.file) fs.unlinkSync(path.join(uploadDir, req.file.filename));
        return res.status(404).render('error', { error: 'ไม่พบสินค้านี้' });
      }

      // ลบไฟล์เก่าถ้ามีการอัพโหลดไฟล์ใหม่และมีไฟล์เก่าอยู่
      if (req.file && oldImage) {
        const oldImagePath = path.join(uploadDir, oldImage);
        if (fs.existsSync(oldImagePath)) {
          fs.unlinkSync(oldImagePath);
        }
      }

      res.redirect('/');
    } catch (err) {
      console.error(err);
      if (req.file) fs.unlinkSync(path.join(uploadDir, req.file.filename));
      res.status(500).render('error', { error: 'เกิดข้อผิดพลาดในการอัปเดตสินค้า' });
    }
  });
});

app.get('/delete/:id', async (req, res) => {
  try {
    if (!ObjectId.isValid(req.params.id)) {
      return res.status(404).render('error', { error: 'ไม่พบสินค้านี้' });
    }

    const product = await productsCollection.findOne({
      _id: new ObjectId(req.params.id),
    });

    if (!product) {
      return res.status(404).render('error', { error: 'ไม่พบสินค้านี้' });
    }

    // ลบไฟล์รูปภาพถ้ามี
    if (product.image) {
      const imagePath = path.join(uploadDir, product.image);
      if (fs.existsSync(imagePath)) {
        fs.unlinkSync(imagePath);
      }
    }

    await productsCollection.deleteOne({ _id: new ObjectId(req.params.id) });
    res.redirect('/');
  } catch (err) {
    console.error(err);
    res.status(500).render('error', { error: 'เกิดข้อผิดพลาดในการลบสินค้า' });
  }
});

app.get('/about', (req, res) => {
  res.render('about', { title: 'เกี่ยวกับเรา' });
});

app.get('/contact', (req, res) => {
  res.render('contact', { title: 'ติดต่อเรา' });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).render('error', { error: 'เกิดข้อผิดพลาดในระบบ' });
});

// 404 Not Found
app.use((req, res) => {
  res.status(404).render('error', { error: 'ไม่พบหน้าที่คุณต้องการ' });
});

// Start server
app.listen(PORT, () => {
  console.log(color.cyan(`\nServer is running on port ${PORT}...`));
  console.log(color.green.bold(`http://localhost:${PORT}\n`));
});

// ปิดการเชื่อมต่อ MongoDB เมื่อแอปหยุดทำงาน
process.on('SIGINT', async () => {
  try {
    await client.close();
    console.log(color.yellow('✓ MongoDB connection closed'));
    process.exit(0);
  } catch (err) {
    console.error(color.red('✗ Error closing MongoDB connection:'), err);
    process.exit(1);
  }
});
