const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
require('dotenv').config();
const stripe = require("stripe")(process.env.PAYMENT_SECRET_KEY);

const app = express();
const port = process.env.PORT || 3000;


//middleware

app.use(cors());
app.use(express.json());



const verifyJWT = (req, res, next) => {
    const authorization = req.headers.authorization;
    if (!authorization) {
        return res.status(401).send({ error: true, message: 'unauthorized access' });
    }
    //bearer token
    const token = authorization.split(' ')[1];

    jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
        if (err) {
            return res.status(401).send({ error: true, message: 'unauthorized access' })
        }
        req.decoded = decoded;
        next();
    })

}



const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.yzqnnly.mongodb.net/?retryWrites=true&w=majority`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    },
});

async function run() {
    try {
        // Connect the client to the server	(optional starting in v4.7)
        // await client.connect();



        const usersCollection = client.db("campDb").collection("users");
        const classCollection = client.db("campDb").collection("classes");
        const instructorCollection = client.db("campDb").collection("instructors");
        const cartCollection = client.db("campDb").collection("carts");
        const paymentCollection = client.db('campDb').collection("payments");

        //jwt
        app.post('/jwt', (req, res) => {
            const user = req.body;
            const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1hr' });
            res.send({ token });
        })


        //use verifyJWT before using verifyAdmin
        const verifyAdmin = async (req, res, next) => {
            const email = req.decoded.email;
            const query = { email: email };
            const user = await usersCollection.findOne(query);
            if (user?.role !== 'admin') {
                return res.status(403).send({ error: true, message: 'forbidden message' })
            }
            next();
        }
        //users related apis

        app.get('/users', verifyJWT, verifyAdmin, async (req, res) => {
            const result = await usersCollection.find().toArray();
            res.send(result);
        })

        app.post('/users', async (req, res) => {
            const user = req.body;
            console.log(user);
            const query = { email: user.email }
            const existingUser = await usersCollection.findOne(query);
            console.log('existing user', existingUser);
            if (existingUser) {
                return res.send({ message: 'user already exist' })
            }
            const result = await usersCollection.insertOne(user);
            res.send(result);
        })

        //check admin
        app.get('/users/admin/:email', verifyJWT, async (req, res) => {
            const email = req.params.email;

            if (req.decoded.email !== email) {
                res.send({ admin: false })
            }

            const query = { email: email };
            const user = await usersCollection.findOne(query);
            const result = { admin: user?.role === 'admin' };
            res.send(result);
        })

        app.get('/users/instructor/:email', verifyJWT, async (req, res) => {
            const email = req.params.email;

            if (req.decoded.email !== email) {
                res.send({ instructor: false });
            }

            const query = { email: email };
            const user = await usersCollection.findOne(query);
            const result = { instructor: user?.role === 'instructor' };
            res.send(result);
        });


        app.patch('/users/admin/:id', async (req, res) => {
            const id = req.params.id;
            const filter = { _id: new ObjectId(id) };
            const updateDoc = {
                $set: {
                    role: 'admin'
                },
            };
            const result = await usersCollection.updateOne(filter, updateDoc);
            res.send(result)
        })

        app.patch('/users/:id/role/:role', verifyJWT, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const role = req.params.role;
            const validRoles = ['admin', 'instructor', 'student'];

            if (!validRoles.includes(role)) {
                return res.status(400).json({ error: 'Invalid role provided' });
            }

            const filter = { _id: new ObjectId(id) };
            const updateDoc = {
                $set: {
                    role: role
                },
            };

            try {
                const result = await usersCollection.updateOne(filter, updateDoc);
                res.json(result);
            } catch (error) {
                res.status(500).json({ error: 'Error updating user role' });
            }
        });


        //classes apis

        app.get('/classes', async (req, res) => {
            const { email } = req.query;
            const query = email ? { instructorEmail: email } : {};
            const result = await classCollection.find(query).toArray();
            res.send(result);
        });

        app.get('/classes/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const result = await classCollection.findOne(query);
            res.send(result);
        })

        app.post('/classes', verifyJWT, async (req, res) => {
            const newItem = req.body;
            const result = await classCollection.insertOne(newItem);
            res.send(result)
        })

        app.delete('/classes/:id', verifyJWT, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) }
            const result = await classCollection.deleteOne(query);
            res.send(result);
        })

        app.put('/classes/:id/approve', verifyJWT, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const update = { $set: { status: 'approve' } };

            try {
                const result = await classCollection.updateOne(query, update);
                if (result.modifiedCount > 0) {
                    res.send({ success: true, message: 'Class status updated to "approve".' });
                } else {
                    res.status(404).send({ success: false, message: 'Class not found.' });
                }
            } catch (error) {
                res.status(500).send({ success: false, message: 'Error updating class status.' });
            }
        });


        //instructor apis
        app.get('/instructors', async (req, res) => {
            const result = await instructorCollection.find().toArray();
            res.send(result);
        })

        app.get('/instructors/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const result = await instructorCollection.findOne(query);
            res.send(result);
        })


        //cart collection

        app.get('/carts', verifyJWT, async (req, res) => {
            const email = req.query.email;
            if (!email) {
                res.send([])
            }

            const decodedEmail = req.decoded.email;
            if (email !== decodedEmail) {
                return res.status(403).send({ error: true, message: 'forbidden access' })
            }

            const query = { email: email }
            const result = await cartCollection.find(query).toArray();
            res.send(result);
        })

        app.post('/carts', async (req, res) => {
            const item = req.body;
            console.log(item);
            const result = await cartCollection.insertOne(item);
            res.send(result);
        })

        app.delete('/carts/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const result = await cartCollection.deleteOne(query);
            res.send(result);
        })

        //create payment method
        app.post('/create-payment-intent', verifyJWT, async (req, res) => {
            const { price } = req.body;
            const amount = price * 100;
            const paymentIntent = await stripe.paymentIntents.create({
                amount: amount,
                currency: "inr",
                payment_method_types: ["card"]
            });
            res.send({
                clientSecret: paymentIntent.client_secret,
            });
        })
          
        //payment related apis
        app.post('/payments', verifyJWT, async (req, res) => {
            const payment = req.body;
            const insertResult = await paymentCollection.insertOne(payment);
          
            const query = { _id: { $in: payment.selectedItems.map(id => new ObjectId(id)) } };
            const deleteResult = await cartCollection.deleteMany(query);

            res.send({ insertResult, deleteResult });
          });
          




        // Send a ping to confirm a successful connection
        await client.db("admin").command({ ping: 1 });
        console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } finally {
        // Ensures that the client will close when you finish/error
        // await client.close();
    }
}
run().catch(console.dir);




app.get('/', (req, res) => {
    res.send('Welcome to Camp Sportopia')
})

app.listen(port, () => {
    console.log(`Camp Sportopia listening on port: ${port}`)
})