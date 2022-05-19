const express = require('express')
const cors = require('cors');
const { MongoClient, ServerApiVersion } = require('mongodb');
require('dotenv').config();
const jwt = require('jsonwebtoken');
const app = express();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());


const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.awau4.mongodb.net/?retryWrites=true&w=majority`;

const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });


async function run() {
    try {

        await client.connect();
        const serviceCollection = client.db('doctors_portal').collection('services');

        // Booking Collection
        const bookingCollection = client.db('doctors_portal').collection('bookings');
        // Users Collection
        const usersCollection = client.db('doctors_portal').collection('users');


        // {4} My Appointemnts with verifying JWT

        function verifyJWT(req, res, next) {

            const authHeader = req.headers.authorization;

            if (!authHeader) {
                return res.status(401).send({ message: 'UnAuthorized' });
            }

            const token = authHeader.split(' ')[1];

            jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, function (err, decoded) {
                if (err) {
                    return res.status(403).send({ message: 'Forbidden Access' });
                }
                req.decoded = decoded;

                next();
            });

        }

        // app.get('/', async (req, res) => {

        // })




        // Get All Services From DB
        app.get('/service', async (req, res) => {
            const query = {};
            const cursor = serviceCollection.find(query);
            const services = await cursor.toArray();
            res.send(services);
        })


        // {3} users set to the DB, can't login same email twice with 3 login methods (login, registratin, googlesignin)

        app.put('/user/:email', async (req, res) => {
            const email = req.params.email;
            const user = req.body;
            const filter = { email: email };
            const options = { upsert: true };
            const updateDoc = {
                $set: user,
            };
            const result = await usersCollection.updateOne(filter, updateDoc, options);
            const token = jwt.sign({ email: email }, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1h' });

            res.send({ result, token });
        })

        //Warning
        // This is not the proper way to query. use aggregate lookup, pipeline, match, group

        app.get('/available', async (req, res) => {
            const date = req.query.date;

            // step 1: get All services

            const services = await serviceCollection.find().toArray();

            //step 2: get the booking of that day [{},{},{},{},{},{},{}]

            const query = { date: date };
            const bookings = await bookingCollection.find(query).toArray();

            // step 3: for each service, 

            services.forEach(service => {

                // step 4: find bookings for that service . Output: [{},{},{}]

                const serviceBookings = bookings.filter(book => book.treatment === service.name);

                // step 5: find slots for that serviceBookings . ['','','','']

                const booked = serviceBookings.map(book => book.slot);

                // step 6: Select those slots that are not in bookedSlots

                const available = service.slots.filter(slot => !booked.includes(slot));

                // Set available to slots to make it easier

                service.slots = available;
            })

            res.send(services);

        })

        /*
            * API Naming Convention

            * app.get('/booking') // get all Bookings in this collection. or get more than one or by filter

            * app.get('/booking/:id')   //  Get a specific Booking 

            * app.post('/booking')      //  Add a new specific Booking

            * app.put('/booking/:id)    // upsert => update (if exists) or insert (if desn't exist)
        
            * app.patch('/booking/:id)  //  Update a specific Booking

            * app.delete('/booking/:id) //  Delete a specific Booking
        */


        // {4} My Appointemnts with verifying JWT

        app.get('/booking', verifyJWT, async (req, res) => {
            const patient = req.query.patient;
            const query = { patient: patient };
            const bookings = await bookingCollection.find(query).toArray();
            res.send(bookings);
        })


        // {2}  Add a new specific Booking

        app.post('/booking', async (req, res) => {
            const booking = req.body;

            // Let a Booking had done. I shouldn't apply a same booking again. 
            // So, we will check that does the user booked an item before or not
            const query = { treatment: booking.treatment, date: booking.date, patient: booking.patient }
            const exists = await bookingCollection.findOne(query);
            if (exists) {
                return res.send({ success: false, booking: exists })
            }


            const result = await bookingCollection.insertOne(booking);
            return res.send({ success: true, result });
        })

    }

    finally {

    }
}
run().catch(console.dir);



app.get('/', (req, res) => {
    res.send('Hello From Doctors Portal Server!')
})

app.listen(port, () => {
    console.log(`Doctors App listening on port ${port}`)
})