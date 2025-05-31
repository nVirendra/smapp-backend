const Post = require('../models/Post');
const asyncHandler = require('../utils/asyncHandler');
const cloudinary = require('../config/cloudinary');

const createPost = async (req, res) => {
  try {
    const { content, is_private } = req.body;

    let mediaUrl = '';
    let mediaType = '';

    if (req.file) {
      const result = await cloudinary.uploader.upload(req.file.path, {
        folder: 'e-milo/posts',
        resource_type: 'auto',
      });

      mediaUrl = result.secure_url;
      mediaType = result.resource_type;
    }

    const newPost = new Post({
      userId: req.user._id,
      content,
      mediaUrl,
      mediaType,
      privacy: is_private === 'true' ? 'private' : 'public',
    });

    const savedPost = await newPost.save();
    return res.status(201).json({ status: true, result: savedPost });
  } catch (err) {
    res
      .status(500)
      .json({ status: false, message: 'Server error', error: err });
  }
};

const getFeedPosts = async (req, res) => {
  try {
    const posts = await Post.find({
      $or: [{ privacy: 'public' }, { userId: req.user._id }],
    })
      .sort({ createdAt: -1 })
      .populate('userId', 'name profilePic')
      .populate('comments.userId', 'name profilePic');

    res.json({ status: true, result: posts });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err });
  }
};

const likePost = asyncHandler(async (req, res) => {
  const post = await Post.findById(req.params.id);
  if (!post) {
    res.status(404).json({ message: 'Post not found' });
    return;
  }

  const userId = req.user._id.toString();
  const liked = post.likes.includes(userId);

  if (liked) {
    await post.updateOne({ $pull: { likes: userId } });
  } else {
    await post.updateOne({ $push: { likes: userId } });
  }

  const updated = await Post.findById(req.params.id);
  res.json({ status: true, result: updated });
});

const commentOnPost = asyncHandler(async (req, res) => {
  const { comment } = req.body;
  const post = await Post.findById(req.params.id);
  if (!post) {
    res.status(404).json({ message: 'Post not found' });
    return;
  }

  post.comments.push({ userId: req.user._id, comment });
  await post.save();

  res.json({ status: true, result: post });
});

const getUserPosts = async (req, res) => {
  const { userId } = req.params;

  try {
    const posts = await Post.find({ userId: userId })
      .sort({ createdAt: -1 })
      .populate('userId', '_id name');

    res.status(200).json({ status: true, result: posts });
  } catch (error) {
    console.error('Error fetching user posts:', error);
    res.status(500).json({ status: false, message: 'Failed to fetch posts' });
  }
};

module.exports = {
  createPost,
  getFeedPosts,
  likePost,
  commentOnPost,
  getUserPosts,
};
