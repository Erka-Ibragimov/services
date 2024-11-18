const express = require('express');
const { Pool } = require('pg');
const amqp = require('amqplib');
require('dotenv').config();

const pool = new Pool({
  user: process.env.POSTGRES_USER,
  host: process.env.POSTGRES_HOST,
  database: process.env.POSTGRES_DB,
  password: process.env.POSTGRES_PASSWORD,
  port: process.env.POSTGRES_PORT
});

const app = express();
app.use(express.json());

let channel, connection;

async function connectRabbitMQ() {
    try {
      connection = await amqp.connect(`amqp://${process.env.RABBITMQ_HOST}:${process.env.RABBITMQ_PORT}`);
      channel = await connection.createChannel();

      await channel.assertQueue('add_product');
      await channel.assertQueue('add_stock');
      await channel.assertQueue('add_stock_increase_shelf');
      await channel.assertQueue('add_stock_decrease_shelf');

      channel.consume('add_product', async (msg) => {
        if (msg !== null) {
          const data = JSON.parse(msg.content.toString());

          const {id, shop_id} = data;
          const action = 'add_product';

          await pool.query(
            'INSERT INTO log (product_id, shop_id, action) VALUES ($1, $2, $3) RETURNING *',
            [id, shop_id, action]
          );
  
          channel.ack(msg);
        }
      });


      channel.consume('add_stock', async (msg) => {
        if (msg !== null) {
          const data = JSON.parse(msg.content.toString());

          const {product_id, shop_id} = data;
          const action = 'add_stock';

          await pool.query(
            'INSERT INTO log (product_id, shop_id, action) VALUES ($1, $2, $3) RETURNING *',
            [product_id, shop_id, action]
          );
  
          channel.ack(msg);
        }
      });

      channel.consume('add_stock_increase_shelf', async (msg) => {
        if (msg !== null) {
          const data = JSON.parse(msg.content.toString());

          const {product_id, shop_id} = data;
          const action = 'add_stock_increase_shelf';

          await pool.query(
            'INSERT INTO log (product_id, shop_id, action) VALUES ($1, $2, $3) RETURNING *',
            [product_id, shop_id, action]
          );
  
          channel.ack(msg);
        }
      });

      channel.consume('add_stock_decrease_shelf', async (msg) => {
        if (msg !== null) {
          const data = JSON.parse(msg.content.toString());

          const {product_id, shop_id} = data;
          const action = 'add_stock_decrease_shelf';

          await pool.query(
            'INSERT INTO log (product_id, shop_id, action) VALUES ($1, $2, $3) RETURNING *',
            [product_id, shop_id, action]
          );
  
          channel.ack(msg);
        }
      });
      console.log('Connected to RabbitMQ');
    } catch (error) {
      console.error('Ошибка подключения к RabbitMQ:', error);
    }
  }


async function start(){
    await connectRabbitMQ()
        
    app.get('/log', async (req, res) => {
          try {
            const { product_id, shop_id, date_start, date_end, action } = req.query;

            if(date_start && !date_end || !date_start && date_end){
              return res.status(404).json({error:'Missing'});
            }

            let query = `SELECT * FROM log WHERE 1=1`;
            
            const params = [];

            if (product_id) {
              query += ` AND product_id = $${params.length + 1}`;
              params.push(product_id);
            }
            if (shop_id) {
              query += ` AND shop_id = $${params.length + 1}`;
              params.push(shop_id);
            }
            if (action) {
              query += ` AND action = $${params.length + 1}`;
              params.push(action);
            }
            if (date_start && date_end) {
              query += ` AND created_at >= $${params.length + 1} AND created_at <= $${params.length + 2}`;
              params.push(date_start);
              params.push(date_end);
            }
        
            const result = await pool.query(query, params);

            res.status(200).json(result.rows);
          } catch (error) {
            res.status(400).json({ error: error.message });
          }
        });
        
        app.listen(Number(process.env.PORT) || 3002, () => {
          console.log('Listening 3002');
    });
}

start()
