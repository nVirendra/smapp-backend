const User = require('../models/User');
const { generateToken } = require('../utils/jwt');

const register = async (req, res) => {
  const { name, email, password } = req.body;
  const userExists = await User.findOne({ email });
  if (userExists) {
    res
      .status(400)
      .json({ status: false, result: [], message: 'Email already registered' });
    return;
  }

  const user = new User({ name, email, password });
  await user.save();

  const token = generateToken(user._id.toString());

  res.status(201).json({
    status: true,
    token,
    user: { id: user._id, name: user.name, email: user.email },
  });
};

const login = async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email });

  if (!user || !(await user.comparePassword(password))) {
    res.status(400).json({ status: false, message: 'Invalid credentials' });
    return;
  }

  const token = generateToken(user._id.toString());

  res.json({
    status: true,
    token,
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
      followers: user.followers.map((f) => f._id),
      following: user.following.map((f) => f._id),
    },
  });
};

module.exports = { register, login };
