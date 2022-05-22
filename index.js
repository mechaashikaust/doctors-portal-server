const express = require('express')
const cors = require('cors');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
var nodemailer = require('nodemailer');
var sgTransport = require('nodemailer-sendgrid-transport');
const stripe = require('stripe')('sk_test_51L27KODAkvG9mHY4dhbSwva03SNuTXSNAHklAOT0xXC2WpHqQKMIZnp5ZylhymUYjPC6GgOdAEB63GzujJNHcGKw00A0NfAIQU');

require('dotenv').config();
const jwt = require('jsonwebtoken');
const app = express();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());


const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.awau4.mongodb.net/?retryWrites=true&w=majority`;

const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });


// {4} My Appointemnts with verifying JWT

function verifyJWT(req, res, next) {
    //1///////////////////////////////////////
    const authHeader = req.headers.authorization;

    //2///////////////////////////////////////
    if (!authHeader) {
        return res.status(401).send({ message: 'UnAuthorized' });
    }
    //3////////////////////////////////////////
    const token = authHeader.split(' ')[1];

    //4////////////////////////////////////////
    jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, function (err, decoded) {
        if (err) {
            return res.status(403).send({ message: 'Forbidden Access' });
        }
        req.decoded = decoded;

        //5/////////////////////////////////////////
        next();

    });

}



// Send GRID // start

const emailSenderOptions = {
    auth: {
        api_key: process.env.EMAIL_SENDER_KEY
    }
}

const emailClient = nodemailer.createTransport(sgTransport(emailSenderOptions));

function sendAppointmentEmail(booking) {
    const { patient, patientName, treatment, date, slot } = booking;

    var email = {
        from: 'mechaashik@gmail.com',
        to: patient,
        subject: `Your Appointment for ${treatment} is on ${date} at ${slot} is Confirmed`,
        text: `Your Appointment for ${treatment} is on ${date} at ${slot} is Confirmed`,
        html: `
        <div>
          <p> Hello ${patientName}, </p>
          <h3>Your Appointment for ${treatment} is confirmed</h3>
          <p>Looking forward to seeing you on ${date} at ${slot}.</p>
          
          <h3>Our Address</h3>
          <p>Andor Killa Bandorban</p>
          <p>Bangladesh</p>
          <a href="https://web.programming-hero.com/">unsubscribe</a>
        </div>
      `
    };

    emailClient.sendMail(email, function (err, info) {
        if (err) {
            console.log(err);
        }
        else {
            console.log('Message sent: ', info);
        }
    });

}

// Send GRID // END

function sendPaymentConfirmationEmail(booking) {
    const { patient, patientName, treatment, date, slot } = booking;
  
    var email = {
      from: 'mechaashik@gmail.com',
      to: patient,
      subject: `We have received your payment for ${treatment} is on ${date} at ${slot} is Confirmed`,
      text: `Your payment for this Appointment ${treatment} is on ${date} at ${slot} is Confirmed`,
      html: `
        <div>
          <p> Hello ${patientName}, </p>
          <h3>Thank you for your payment . </h3>
          <h3>We have received your payment</h3>
          <p>Looking forward to seeing you on ${date} at ${slot}.</p>
          <h3>Our Address</h3>
          <p>Andor Killa Bandorban</p>
          <p>Bangladesh</p>
          <a href="https://web.programming-hero.com/">unsubscribe</a>
        </div>
      `
    };
  
    emailClient.sendMail(email, function (err, info) {
      if (err) {
        console.log(err);
      }
      else {
        console.log('Message sent: ', info);
      }
    });
  
  }


async function run() {
    try {

        await client.connect();
        const serviceCollection = client.db('doctors_portal').collection('services');

        // Booking Collection
        const bookingCollection = client.db('doctors_portal').collection('bookings');
        // Users Collection
        const usersCollection = client.db('doctors_portal').collection('users');
        // Doctors Collection
        const doctorCollection = client.db('doctors_portal').collection('doctors');
        // Payment Collection
        const paymentCollection = client.db('doctors_portal').collection('payments');


        // Verifying admin for doctors         (after image uploading) 
        const verifyAdmin = async (req, res, next) => {

            //Copied from jwt
            const requester = req.decoded.email;
            const requesterAccount = await usersCollection.findOne({ email: requester });
            if (requesterAccount.role === 'admin') {
                //Copied from jwt // END

                next();
            }
            else {
                res.status(403).send({ message: 'forbidden' });
            }
        }




        // app.get('/', async (req, res) => {

        // })


        // {13} Calculate Order Amount (https://stripe.com/docs/payments/quickstart)

        app.post('/create-payment-intent', verifyJWT, async (req, res) => {
            const service = req.body;
            const price = service.price;
            const amount = price * 100;
            const paymentIntent = await stripe.paymentIntents.create({
                amount: amount,
                currency: 'usd',
                payment_method_types: ['card']
            });
            res.send({ clientSecret: paymentIntent.client_secret })
        });




        // Get All Services From DB
        // {8} Add Doctors data getting  => .project({ name: 1 })

        app.get('/service', async (req, res) => {
            const query = {};
            const cursor = serviceCollection.find(query).project({ name: 1 });
            const services = await cursor.toArray();
            res.send(services);
        })



        // {7} Checking that are you admin or not
        app.get('/admin/:email', async (req, res) => {
            const email = req.params.email;
            const user = await usersCollection.findOne({ email: email });
            const isAdmin = user.role === 'admin';
            res.send({ admin: isAdmin })
        })


        // {6} Admin

        app.put('/user/admin/:email', verifyJWT, verifyAdmin, async (req, res) => {
            const email = req.params.email;

            const filter = { email: email };
            const updateDoc = {
                $set: { role: 'admin' },
            };
            const result = await usersCollection.updateOne(filter, updateDoc);

            res.send({ result });


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




        // {5} get All Users

        app.get('/user', verifyJWT, async (req, res) => {
            const users = await usersCollection.find().toArray();
            res.send(users);
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
            const decodedEmail = req.decoded.email;
            if (patient === decodedEmail) {
                const query = { patient: patient };
                const bookings = await bookingCollection.find(query).toArray();
                return res.send(bookings);
            }
            else {
                return res.status(403).send({ message: 'Forbidden Access' });
            }
        })

        // {12} Get data for Payment route for a specific id.

        app.get('/booking/:id', verifyJWT, async (req, res) => {
            const id = req.params.id;
            const query = { _id: ObjectId(id) };
            const booking = await bookingCollection.findOne(query);
            res.send(booking);
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

            // SendGrid (mail verification)
            sendAppointmentEmail(booking);

            return res.send({ success: true, result });
        });


        // {13} Payment Updating

        app.patch('/booking/:id', verifyJWT, async(req, res) =>{
            const id  = req.params.id;
            const payment = req.body;
            const filter = {_id: ObjectId(id)};
            const updatedDoc = {
              $set: {
                paid: true,
                transactionId: payment.transactionId
              }
            }
      
            const result = await paymentCollection.insertOne(payment);
            const updatedBooking = await bookingCollection.updateOne(filter, updatedDoc);
            sendPaymentConfirmationEmail(booking);
            res.send(updatedBooking);
          })


        // {10} Getting all Doctors 
        app.get('/doctor', verifyJWT, verifyAdmin, async (req, res) => {
            const doctors = await doctorCollection.find().toArray();
            res.send(doctors);
        })

        // {9} Doctor Adding & image Uploading

        app.post('/doctor', verifyJWT, verifyAdmin, async (req, res) => {
            const doctor = req.body;
            const result = await doctorCollection.insertOne(doctor);
            res.send(result);
        })

        // {11} Delete Doctor
        app.delete('/doctor/:email', verifyJWT, verifyAdmin, async (req, res) => {
            const email = req.params.email;
            const filter = { email: email };
            const result = await doctorCollection.deleteOne(filter);
            res.send(result);
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