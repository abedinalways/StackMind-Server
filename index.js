const express = require('express');
const app = express();
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
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
    const commentsCollection= client.db('StackMind').collection('comments');
    //indexing for search
    await blogsCollection.createIndex({ title: 'text' });
    await blogsCollection.createIndex({ category: 1 });
    //get recent blog
    app.get('/blogs', async (req, res) => {
      const cursor = blogsCollection.find().sort({ createdAt: -1 }).limit(6);
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
        const result = await cursor.toArray();
        res.send(result);
      } catch (err) {
        res.status(500).send({ error: 'Failed to fetch blogs' });
      }
    });

    //get top 10 featured blog by longDescription word count
    app.get('/featuredBlogs', async (req, res) => {
      try {
        const blogs = await blogsCollection.aggregate([
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
        ]).toArray();
        res.status(200).send(blogs);
      } catch (err) {
        res.status(500).send({error:'failed to fetch featured blog'})
      }
    })

    //To get a single blog by its ID for the details page
    app.get('/allBlogs/:id', async (req, res) => {
         try{
           const blogId = req.params.id;
           const blog = await blogsCollection.findOne({ _id: new ObjectId(blogId) });
           if (!blog) {
             return res.status(404).send({ error: 'Blog not found' });
           }
           res.status(200).send(blog);
         }catch(err){
          res.status(500).send({ error: 'Failed to fetch blog details' });
         }
       })
    //get comments for a blog Id
    app.get('/comments', async (req, res) => {
      try {
        const blogId = req.query.blogId;
        if (!blogId) {
          return res.status(400).send({ error: 'Blog ID is required' });
        }
        const result = await commentsCollection
          .find({ blogId})
          .sort({ createdAt: -1 })
          .toArray();
        res.status(200).send(result);
      } catch(err) {
        res.status(500).send({ error: 'Failed to fetch comments' });
      }
    })
    // Add a comment to a blog post
    app.post('/comments', async (req, res) => {
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
    app.post('/blogs', async (req, res) => {
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
    app.post('/wishList', async (req, res) => {
      try {
        const { blogId, userEmail } = req.body;
        if (!blogId || !userEmail) {
          return res
            .status(400)
            .send({ error: 'Blog ID or user email is required' });
        }
        const exist = await wishListCollection.findOne({
          blogId: new ObjectId(blogId),
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
    app.delete('/wishList/:id', async (req, res) => {
      const blogId = req.params.id;
      const email = req.query.email;
      try {
        const result = await wishListCollection.deleteOne({
          blogId,
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
    app.get('/wishList/:email', async (req, res) => {
      try {
        const email = req.params.email;
        const wishList = await wishListCollection
          .find({ userEmail: email })
          .toArray();
        const blogIds = wishList.map(item => item.blogId);
        const blogs = await blogsCollection
          .find({ _id: { $in: blogIds } })
          .toArray();
        res.status(200).send(blogs);
      } catch (err) {
        res.status(500).send({ error: 'Failed to fetch wishList' });
      }
    });

    //update blog
    app.patch('/allBlogs/:id', async (req, res) => {
      try {
        const blogId = req.params.id;
        const userEmail= req.query.email;
        const updatedBlog = req.body;

        delete updatedBlog._id;
        delete updatedBlog.createdAt;
        delete updatedBlog.email;

        const blog = await blogsCollection.findOne({ _id: new ObjectId(blogId) });
        if (!blog) {
          return res.status(404).send({ error: 'Blog not found' });
        }
        if (blog.email !== userEmail) {
          return res.status(403).send({ error: 'You are not authorized to update this blog' });
        }

        const result = await blogsCollection.updateOne({ _id: new ObjectId(blogId) }, { $set: updatedBlog });
        if( result.matchedCount === 0) {
          return res
            .status(404)
            .send({ error: 'Blog not found or no changes made' });
        }
        res.status(200).send({ message: 'Blog updated successfully', result });
      }catch (err) {
        res.status(500).send({ error: 'Failed to update blog' });
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