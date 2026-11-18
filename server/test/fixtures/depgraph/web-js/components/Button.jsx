import widgetValue from '.';
import { rootValue } from '..';
import './index.css';
import logo from './logo.svg';
import User, { Role, Y } from '../models/user.js';

const helper = require('../models/helper.cjs');

export function Button() {
  return [widgetValue, rootValue, logo, User, Role, Y, helper];
}
