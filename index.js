const express = require('express');
const app = express();
const { MongoClient, ServerApiVersion } = require('mongodb');
const cors = require('cors');
const port = process.env.PORT || 3000;
require('dotenv').config();
//middleware
app.use(cors());
app.use(express.json());



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
    //indexing for search
    await blogsCollection.createIndex({ title: 'text' });
    await blogsCollection.createIndex({ category: 1 });
   //get recent blog
    app.get('/blogs', async (req, res) => {
      const cursor = blogsCollection.find().sort({createdAt:-1}).limit(6);
      const result = await cursor.toArray();
      res.send(result);
    });
    //get all blogs

    app.get('/allBlogs', async (req, res) => {
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
        const result=await cursor.toArray();
        res.send(result);
      }catch (err) {
        res.status(500).send({ error: 'Failed to fetch blogs' });
      }
    })
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
    })
    // Create a new blog post
    app.post('/blogs', async (req, res) => {
      try {
        const newBlog = {
          ...req.body, createdAt: new Date(),
        }
        const result= await blogsCollection.insertOne(newBlog);
        res.send(result);
      } catch (err) {
        res.status(500).send({error: 'Failed to create blog post'});
      }   
    })
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