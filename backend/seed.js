import bcrypt from 'bcryptjs';
import { q } from './src/db.js';

await q(`INSERT INTO bases(name) VALUES ('Alpha'),('Bravo')`);
await q(`INSERT INTO equipment_types(name,category) VALUES
  ('Humvee','vehicle'),('M4 Rifle','weapon'),('5.56mm Rounds','ammunition')`);
const h = bcrypt.hashSync('pass123', 10);
await q(`INSERT INTO users(username,password_hash,role,base_id) VALUES
  ('admin',$1,'admin',NULL),
  ('commander1',$1,'base_commander',1),
  ('logistics1',$1,'logistics_officer',1)`, [h]);
process.exit(0);
