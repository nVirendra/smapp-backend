#clone project
git clone https://github.com/nVirendra/e-milo-server.git

#Go to the server directory
cd e-milo-server

#Install dependencies
npm install

#Create .env file in /server
PORT=5000
MONGO_URI=your_mongodb_connection_string
JWT_SECRET=your_jwt_secret_key

CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_cloudinary_api_key
CLOUDINARY_API_SECRET=your_cloudinary_api_secret

#Start the backend server
npm run dev
