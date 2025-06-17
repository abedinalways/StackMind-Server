const express = require('express');
const app = express();
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const cors = require('cors');
const port = process.env.PORT || 3000;
require('dotenv').config();

// Environment variable validation
const requiredEnvVars = ['DB_USER', 'DB_PASS', 'JWT_ACCESS_TOKEN'];
requiredEnvVars.forEach(varName => {
  if (!process.env[varName]) {
    throw new Error(`Environment variable ${varName} is missing`);
  }
});
if (process.env.JWT_ACCESS_TOKEN.length < 32) {
  throw new Error('JWT_ACCESS_TOKEN must be at least 32 characters long');
}

// Logger middleware
const logger = (req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
};

// JWT verification middleware
const verifyToken = (req, res, next) => {
  const token = req.cookies.token;
  if (!token)
    return res
      .status(401)
      .send({ error: 'No token provided, authorization denied' });
  try {
    const decoded = jwt.verify(token, process.env.JWT_ACCESS_TOKEN);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).send({ error: 'Invalid or expired token' });
  }
};

// Middleware
app.use(
  cors({
    origin: ['http://localhost:5173', 'https://stackmind-auth.web.app'],
    credentials: true,
  })
);
app.use(express.json());
app.use(cookieParser());
app.use(logger);

// MongoDB connection
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.4oy8t6b.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: false,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    await client.connect();
    const db = client.db('StackMind');
    const blogsCollection = db.collection('blogs');
    const wishListCollection = db.collection('wishList');
    const commentsCollection = db.collection('comments');
    const starCollection = db.collection('StarPerson');

    await blogsCollection.createIndex({ title: 'text' });
    await blogsCollection.createIndex({ category: 1 });

    // Auth endpoints
    app.post('/jwt', async (req, res) => {
      const user = { email: req.body.email };
      const token = jwt.sign(user, process.env.JWT_ACCESS_TOKEN, {
        expiresIn: '7d',
      });
      res
        .cookie('token', token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'None',
        })
        .send({ message: 'jwt created successfully' });
    });

    app.post('/logout', (req, res) => {
      res.clearCookie('token', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'None',
      });
      res.send({ message: 'Logged out successfully' });
    });

    // Blog endpoints
    app.get('/blogs', async (req, res) => {
      try {
        const result = await blogsCollection
          .find()
          .sort({ createdAt: -1 })
          .limit(6)
          .toArray();
        res.send(result);
      } catch (err) {
        res.status(500).send({ error: 'Failed to fetch recent blogs' });
      }
    });

    app.get('/allBlogs', async (req, res) => {
      try {
        const { category, search } = req.query;
        let query = {};
        if (category) query.category = category;
        if (search) query.$text = { $search: search };
        const result = await blogsCollection
          .find(query)
          .sort({ createdAt: -1 })
          .toArray();
        res.send(result);
      } catch (err) {
        res.status(500).send({ error: 'Failed to fetch blogs' });
      }
    });

    app.get('/featuredBlogs', async (req, res) => {
      try {
        const blogs = await blogsCollection
          .aggregate([
            {
              $addFields: {
                wordCount: { $size: { $split: ['$longDescription', ' '] } },
              },
            },
            { $sort: { wordCount: -1 } },
            { $limit: 10 },
            {
              $project: {
                title: 1,
                category: 1,
                name: 1,
                createdAt: 1,
                wordCount: 1,
              },
            },
          ])
          .toArray();
        res.send(blogs);
      } catch (err) {
        res.status(500).send({ error: 'Failed to fetch featured blogs' });
      }
    });

    app.get('/allBlogs/:id', async (req, res) => {
      try {
        const blogId = req.params.id;
        if (!ObjectId.isValid(blogId)) {
          return res.status(400).send({ error: 'Invalid blog ID' });
        }
        const blog = await blogsCollection.findOne({
          _id: new ObjectId(blogId),
        });
        if (!blog) return res.status(404).send({ error: 'Blog not found' });
        res.send(blog);
      } catch (err) {
        res.status(500).send({ error: 'Failed to fetch blog details' });
      }
    });

    app.post('/blogs', verifyToken, async (req, res) => {
      try {
        const newBlog = {
          ...req.body,
          email: req.user.email,
          createdAt: new Date(),
        };
        const result = await blogsCollection.insertOne(newBlog);
        res.status(201).send(result);
      } catch (err) {
        res.status(500).send({ error: 'Failed to create blog post' });
      }
    });

    app.patch('/allBlogs/:id', verifyToken, async (req, res) => {
      try {
        const blogId = req.params.id;
        const userEmail = req.query.email;
        const updatedBlog = req.body;
        delete updatedBlog._id;
        delete updatedBlog.createdAt;
        delete updatedBlog.email;

        if (!ObjectId.isValid(blogId)) {
          return res.status(400).send({ error: 'Invalid blog ID' });
        }
        if (userEmail !== req.user.email) {
          return res.status(403).send({ error: 'Unauthorized' });
        }

        const blog = await blogsCollection.findOne({
          _id: new ObjectId(blogId),
        });
        if (!blog) return res.status(404).send({ error: 'Blog not found' });
        if (blog.email !== userEmail) {
          return res.status(403).send({ error: 'Unauthorized' });
        }

        const result = await blogsCollection.updateOne(
          { _id: new ObjectId(blogId) },
          { $set: updatedBlog }
        );
        res.send({ message: 'Blog updated successfully', result });
      } catch (err) {
        res.status(500).send({ error: 'Failed to update blog' });
      }
    });

    // Wishlist endpoints
    app.post('/wishList', verifyToken, async (req, res) => {
      try {
        const { blogId, userEmail } = req.body;
        if (!blogId || !userEmail) {
          return res
            .status(400)
            .send({ error: 'Blog ID or user email is required' });
        }
        if (!ObjectId.isValid(blogId)) {
          return res.status(400).send({ error: 'Invalid blog ID' });
        }
        const exist = await wishListCollection.findOne({ blogId, userEmail });
        if (exist)
          return res.status(400).send({ error: 'Already in wishlist' });

        const result = await wishListCollection.insertOne({
          blogId: new ObjectId(blogId),
          userEmail,
          addedAt: new Date(),
        });
        res.status(201).send(result);
      } catch (err) {
        res.status(500).send({ error: 'Failed to add to wishlist' });
      }
    });

    app.delete('/wishList/:id', verifyToken, async (req, res) => {
      try {
        const blogId = req.params.id;
        const email = req.query.email;
        if (!ObjectId.isValid(blogId)) {
          return res.status(400).send({ error: 'Invalid blog ID' });
        }
        if (email !== req.user.email) {
          return res.status(403).send({ error: 'Unauthorized' });
        }

        const result = await wishListCollection.deleteOne({
          blogId: new ObjectId(blogId),
          userEmail: email,
        });
        if (!result.deletedCount) {
          return res.status(404).send({ error: 'Not found in wishlist' });
        }
        res.send({ message: 'Removed successfully' });
      } catch (err) {
        res.status(500).send({ error: 'Failed to remove from wishlist' });
      }
    });

    app.get('/wishList/:email', verifyToken, async (req, res) => {
      try {
        const email = req.params.email;
        if (email !== req.user.email) {
          return res.status(403).send({ error: 'Unauthorized' });
        }

        const wishList = await wishListCollection
          .find({ userEmail: email })
          .toArray();
        if (wishList.length === 0) return res.status(200).send([]);
        const blogIds = wishList.map(item =>
          typeof item.blogId === 'string' && ObjectId.isValid(item.blogId)
            ? new ObjectId(item.blogId)
            : item.blogId
        );

        const blogs = await blogsCollection
          .aggregate([
            { $match: { _id: { $in: blogIds } } },
            {
              $addFields: {
                wordCount: {
                  $size: {
                    $split: [{ $ifNull: ['$longDescription', ''] }, ' '],
                  },
                },
              },
            },
            { $sort: { createdAt: -1 } },
            {
              $project: {
                _id: 1,
                title: 1,
                category: 1,
                name: 1,
                createdAt: 1,
                wordCount: 1,
              },
            },
          ])
          .toArray();

        res.send(blogs);
      } catch (err) {
        res.status(500).send({ error: 'Failed to fetch wishlist' });
      }
    });

    // Comments endpoints
    app.get('/comments', async (req, res) => {
      try {
        const blogId = req.query.blogId;
        if (!blogId) return res.status(400).send({ error: 'Blog ID required' });
        if (!ObjectId.isValid(blogId))
          return res.status(400).send({ error: 'Invalid blog ID' });
        const result = await commentsCollection
          .find({ blogId })
          .sort({ createdAt: -1 })
          .toArray();
        res.send(result);
      } catch (err) {
        res.status(500).send({ error: 'Failed to fetch comments' });
      }
    });

    app.post('/comments', verifyToken, async (req, res) => {
      try {
        const { blogId, userEmail, text } = req.body;
        if (!blogId || !userEmail || !text) {
          return res.status(400).send({ error: 'All fields required' });
        }
        if (!ObjectId.isValid(blogId))
          return res.status(400).send({ error: 'Invalid blog ID' });
        const result = await commentsCollection.insertOne({
          blogId,
          userEmail,
          text,
          createdAt: new Date(),
        });
        res.status(201).send(result);
      } catch (err) {
        res.status(500).send({ error: 'Failed to add comment' });
      }
    });

    // Categories endpoint
    app.get('/categories', async (req, res) => {
      try {
        const categories = await blogsCollection.distinct('category');
        res.send(categories.sort());
      } catch (err) {
        res.status(500).send({ error: 'Failed to fetch categories' });
      }
    });

    // Star of the week
    app.get('/api/starPerson', async (req, res) => {
      try {
        const result = await starCollection
          .aggregate([{ $sample: { size: 1 } }])
          .toArray();
        res.send(result[0] || {});
      } catch (err) {
        res.status(500).send({ error: 'Failed to fetch star person' });
      }
    });

    // Dashboard token check
    app.get('/api/dashboard', verifyToken, (req, res) => {
      res.send({ message: 'Token is valid', user: req.user });
    });

    // Health check
    app.get('/health', (req, res) => {
      res.send({ status: 'healthy' });
    });
  } catch (err) {
    console.error('Server startup error:', err);
    process.exit(1); // Exit if connection fails
  }
}

run().catch(console.error);

app.get('/', (req, res) => {
  res.send('StackMind backend is running!');
});

app.listen(port, () => {
  console.log(`StackMind app is listening on port ${port}`);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('Shutting down...');
  await client.close();
  process.exit(0);
});
