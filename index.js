const express = require('express');
const app = express();
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const cors = require('cors');
const port = process.env.PORT || 3000;
require('dotenv').config();


//logger middleware
const logger = (req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
}

// JWT verification middleware
const verifyToken = (req, res, next) => {
  const token = req.cookies.token; 
  if (!token) {
    return res.status(401).send({ error: 'No token provided, authorization denied' });
  }
  try {
    const decoded = jwt.verify(token, process.env.JWT_ACCESS_TOKEN);
    req.user = decoded; 
    next();
  } catch (err) {
    return res.status(401).send({ error: 'Invalid or expired token' });
  }
};

//middleware
app.use(
  cors({
    origin: ['http://localhost:5173'],
    credentials:true
  })
);
app.use(express.json());
app.use(cookieParser());
app.use(logger);




const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.4oy8t6b.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
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
    const blogsCollection = client.db('StackMind').collection('blogs');
    const wishListCollection = client.db('StackMind').collection('wishList');
    const commentsCollection = client.db('StackMind').collection('comments');
    const starCollection = client.db('StackMind').collection('StarPerson');
    //indexing for search
    await blogsCollection.createIndex({ title: 'text' });
    await blogsCollection.createIndex({ category: 1 });

    //jwt token related API
    app.post('/jwt', async (req, res) => {
      const user = { email: req.body.email };

      //token creation
      const token = jwt.sign(user, process.env.JWT_ACCESS_TOKEN, {
        expiresIn: '7d',
      });

      //set token in the cookie
      res
        .cookie('token', token, {
          httpOnly: true,
          secure: false,
        })
        .send({ message: 'jwt created successfully' });
    });

    // Logout 
    app.post('/logout', (req, res) => {
      res.clearCookie('token', {
        httpOnly: true,
        secure: false, 
      });
      res.send({ message: 'Logged out successfully' });
    });

    //
    //get recent blog
    app.get('/blogs', async (req, res) => {
      const cursor = blogsCollection.find().sort({ createdAt: -1 }).limit(6);
      const result = await cursor.toArray();
      res.send(result);
    });

    //get all blogs
    app.get('/allBlogs',  async (req, res) => {
      try {
        const { category, search } = req.query;
        let query = {};
        if (category) {
          query.category = category;
        }
        if (search) {
          query.$text = { $search: search };
        }
        const cursor = blogsCollection.find(query).sort({ createdAt: -1 });
        const result = await cursor.toArray();
        res.send(result);
      } catch (err) {
        res.status(500).send({ error: 'Failed to fetch blogs' });
      }
    });

    //get top 10 featured blog by longDescription word count
    app.get('/featuredBlogs', async (req, res) => {
      try {
        const blogs = await blogsCollection
          .aggregate([
            {
              $addFields: {
                wordCount: {
                  $size: {
                    $split: ['$longDescription', ' '],
                  },
                },
              },
            },
            {
              $sort: { wordCount: -1 },
            },
            {
              $limit: 10,
            },
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
        res.status(200).send(blogs);
      } catch (err) {
        res.status(500).send({ error: 'failed to fetch featured blog' });
      }
    });


    //To get a single blog by its ID for the details page
    app.get('/allBlogs/:id', async (req, res) => {
      try {
        const blogId = req.params.id;
        const blog = await blogsCollection.findOne({
          _id: new ObjectId(blogId),
        });
        if (!blog) {
          return res.status(404).send({ error: 'Blog not found' });
        }
        res.status(200).send(blog);
      } catch (err) {
        res.status(500).send({ error: 'Failed to fetch blog details' });
      }
    });
    
    //get comments for a blog Id
    app.get('/comments', async (req, res) => {
      try {
        const blogId = req.query.blogId;
        if (!blogId) {
          return res.status(400).send({ error: 'Blog ID is required' });
        }
        const result = await commentsCollection
          .find({ blogId })
          .sort({ createdAt: -1 })
          .toArray();
        res.status(200).send(result);
      } catch (err) {
        res.status(500).send({ error: 'Failed to fetch comments' });
      }
    });
    // Add a comment to a blog post
    app.post('/comments', verifyToken, async (req, res) => {
      const comment = req.body;
      if (!comment.blogId || !comment.userEmail || !comment.text) {
        return res.status(400).send({ error: 'All fields are required' });
      }
      comment.createdAt = new Date();
      try {
        const result = await commentsCollection.insertOne(comment);
        res.status(201).send(result);
      } catch (err) {
        res.status(500).send({ error: 'Failed to add comment' });
      }
    });
    //get all categories
    app.get('/categories', async (req, res) => {
      try {
        const categories = await blogsCollection.distinct('category');
        categories.sort();
        res.status(200).send(categories);
      } catch (err) {
        console.error('Failed to fetch categories:', err);
        res.status(500).send({ error: 'Error fetching categories' });
      }
    });
    // Create a new blog post
    app.post('/blogs', verifyToken, async (req, res) => {
      try {
        const newBlog = {
          ...req.body,
          createdAt: new Date(),
        };
        const result = await blogsCollection.insertOne(newBlog);
        res.send(result);
      } catch (err) {
        res.status(500).send({ error: 'Failed to create blog post' });
      }
    });
    //  Add to wishlist
    app.post('/wishList', verifyToken, async (req, res) => {
      try {
        const { blogId, userEmail } = req.body;
        if (!blogId || !userEmail) {
          return res
            .status(400)
            .send({ error: 'Blog ID or user email is required' });
        }
        const exist = await wishListCollection.findOne({
          blogId,
          userEmail,
        });
        if (exist) {
          return res.status(400).send({ error: 'Blog already in wishList' });
        }
        const wishListItem = {
          blogId: new ObjectId(blogId),
          userEmail,
          addedAt: new Date(),
        };
        const result = await wishListCollection.insertOne(wishListItem);
        res.status(201).send(result);
      } catch (err) {
        res.status(500).send({ error: 'Failed to add to wishList' });
      }
    });

    // Remove from wishlist
    app.delete('/wishList/:id', verifyToken, async (req, res) => {
      const blogId = req.params.id;
      const email = req.query.email;
      if (email !== req.user.email) {
        return res.status(403).send({ error: 'Unauthorized to remove from wishlist' });
      }
      try {
        const result = await wishListCollection.deleteOne({
          blogId: new ObjectId(blogId),
          userEmail: email,
        });
        if (result.deletedCount === 0) {
          return res.status(404).send({ error: 'Blog not found in wishList' });
        }
        res
          .status(200)
          .send({ message: 'Blog removed from wishList successfully' });
      } catch (err) {
        res.status(500).send({ error: 'Failed to remove from wishList' });
      }
    });
    //get all wishListed blogs for a user
    app.get('/wishList/:email', verifyToken, async (req, res) => {
      try {
        const email = req.params.email;
        console.log('Fetching wishlist for email:', email);
        if (email !== req.user.email) {
          console.log('Unauthorized access attempt:', {
            requestedEmail: email,
            userEmail: req.user.email,
          });
          return res
            .status(403)
            .send({ error: 'Unauthorized to access wishlist' });
        }
        const wishList = await wishListCollection
          .find({ userEmail: email })
          .toArray();
        console.log('Wishlist items:', wishList);
        if (wishList.length === 0) {
          console.log('No wishlist items found for email:', email);
          return res.status(200).send([]);
        }
        const blogIds = wishList.map(item => {
          const blogId =
            typeof item.blogId === 'string'
              ? new ObjectId(item.blogId)
              : item.blogId;
          console.log('Processing blogId:', blogId); 
          return blogId;
        });
        console.log('Blog IDs for aggregation:', blogIds);
        const blogs = await blogsCollection
          .aggregate([
            {
              $match: {
                _id: { $in: blogIds },
              },
            },
            {
              $addFields: {
                wordCount: {
                  $size: {
                    $split: [{ $ifNull: ['$longDescription', ''] }, ' '],
                  },
                },
              },
            },
            {
              $sort: { createdAt: -1 },
            },
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
        console.log('Aggregated blogs:', blogs); 
        res.status(200).send(blogs);
      } catch (err) {
        console.error('Error fetching wishlist:', err);
        res.status(500).send({ error: 'Failed to fetch wishlist' });
      }
    });
    //to get Star of the week
    app.get('/api/starPerson', async (req, res) => {
      try {
        const result = await starCollection
          .aggregate([{ $sample: { size: 1 } }])
          .toArray();
        res.send(result[0]);
      } catch (err) {
        res.status(500).send({
          error: 'failed to fetch the person',
        });
      }
    });

    //update blog
    app.patch('/allBlogs/:id', verifyToken, async (req, res) => {
      try {
        const blogId = req.params.id;
        const userEmail = req.query.email;
        const updatedBlog = req.body;

        delete updatedBlog._id;
        delete updatedBlog.createdAt;
        delete updatedBlog.email;

        if (userEmail !== req.user.email) {
          return res.status(403).send({ error: 'You are not authorized to update this blog' });
        }

        const blog = await blogsCollection.findOne({
          _id: new ObjectId(blogId),
        });
        if (!blog) {
          return res.status(404).send({ error: 'Blog not found' });
        }
        if (blog.email !== userEmail) {
          return res
            .status(403)
            .send({ error: 'You are not authorized to update this blog' });
        }

        const result = await blogsCollection.updateOne(
          { _id: new ObjectId(blogId) },
          { $set: updatedBlog }
        );
        if (result.matchedCount === 0) {
          return res
            .status(404)
            .send({ error: 'Blog not found or no changes made' });
        }
        res.status(200).send({ message: 'Blog updated successfully', result });
      } catch (err) {
        res.status(500).send({ error: 'Failed to update blog' });
      }
    });

    app.get('/api/dashboard', verifyToken, (req, res) => {
      res.send({ message: 'Token is valid', user: req.user });
    });
    // Send a ping to confirm a successful connection
    await client.db('admin').command({ ping: 1 });
    console.log(
      'Pinged your deployment. You successfully connected to MongoDB!'
    );
  } finally {
    // Ensures that the client will close when you finish/error
    //await client.close();
  }
}
run().catch(console.dir);

app.get('/', (req, res) => {
  res.send('StackMind backend is running!');
});


app.listen(port, () => {
  console.log(`StackMind app is listening on port ${port}`);
});