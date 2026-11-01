-- =====================================================================
-- TraceNet demo data - ALL PEOPLE, PLACES AND EVENTS ARE FICTIONAL.
--
-- Run by `npm run db:seed` / `npm run db:reset` AFTER the demo users are
-- inserted (users need bcrypt hashes, so they are created by the seed
-- script, not here). User ids: 1 chief, 2 sana, 3 bilal, 4 omar,
-- 5 mariam (evidence officer), 6 ayesha, 7 kamran (inactive).
--
-- The helper functions ago_days(n), ago_date(n) are registered by the seed
-- script so every timestamp is relative to "now" and the dashboard always
-- shows fresh-looking activity.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Locations
-- ---------------------------------------------------------------------
INSERT INTO locations (id, name, address, city, kind, latitude, longitude, notes) VALUES
 (1,  'Harbor Street Jewellers',          '14 Harbor Street, Old Town',                    'Islamabad', 'business',     33.7101, 73.0551, 'Family-run jewellery store with a rear loading door.'),
 (2,  'Gulberg Heights, Apartment 5B',    'Tower B, Gulberg Heights',                      'Islamabad', 'residence',    33.6914, 73.0713, NULL),
 (3,  'Central Plaza Parking, Level 2',   'Central Plaza, Commerce Avenue',                'Islamabad', 'public_space', 33.7001, 73.0602, 'Covered car park. Exit barrier logs tickets.'),
 (4,  'Northfield Tech Park, Block C',    'Northfield Tech Park, Block C',                 'Islamabad', 'business',     33.7305, 73.0924, 'Houses the payroll servers of several tenants.'),
 (5,  'Eastgate Warehouse 7',             'Eastgate Industrial Estate, Unit 7',            'Islamabad', 'business',     33.6602, 73.1203, 'Bonded storage. One night watchman on duty.'),
 (6,  'Riverside Cafe',                   '22 Riverside Promenade',                        'Islamabad', 'business',     33.7155, 73.0488, NULL),
 (7,  'Old Railway Underpass',            'Station Road, beside the old railway bridge',   'Islamabad', 'public_space', 33.6845, 73.0377, 'Poor street lighting after 20:00.'),
 (8,  'City Savings Bank, Main Branch',   '1 Commerce Avenue',                             'Islamabad', 'business',     33.7012, 73.0615, NULL),
 (9,  'Greenfield Public School',         'Greenfield Road',                               'Islamabad', 'government',   33.6788, 73.0801, NULL),
 (10, 'Blue Line Taxi Stand',             'Junction of Station Road and Market Street',    'Islamabad', 'public_space', 33.6862, 73.0399, NULL),
 (11, 'BazaarNet online marketplace',     'Listings on bazaarnet.example',                 'Islamabad', 'online',       NULL,    NULL,    'Online venue. No physical address.'),
 (12, 'Sunrise Apartments, Basement Garage', 'Sunrise Apartments, Canal View',             'Islamabad', 'residence',    33.6951, 73.0966, NULL),
 (13, 'Golden Anchor Traders',            'Shop 9, Old Market',                            'Islamabad', 'business',     33.7089, 73.0533, 'Pawn and second-hand goods dealer.');

-- ---------------------------------------------------------------------
-- Cases
-- ---------------------------------------------------------------------
INSERT INTO cases (id, case_number, title, description, crime_type, incident_date, location_id, priority, status, resolution, closed_at, created_by, created_at) VALUES
 (1,  'TN-2026-0001', 'Harbor Street Jewellery Store Burglary',
      'Rear door forced overnight. Display cases emptied of rings and watches; alarm panel was disabled for eleven minutes before the break-in.',
      'burglary', ago_date(12), 1, 'high', 'investigating', NULL, NULL, 2, ago_days(12)),
 (2,  'TN-2026-0002', 'Northfield Payroll Diversion',
      'Salary payments for 14 employees were redirected to a newly created beneficiary account during the monthly payroll run.',
      'fraud', ago_date(25), 4, 'high', 'suspect_identified', NULL, NULL, 4, ago_days(24)),
 (3,  'TN-2026-0003', 'Eastgate Warehouse Contraband Seizure',
      'Customs tip led to the seizure of mislabelled pallets. Manifests list a consignee that cannot be found.',
      'smuggling', ago_date(20), 5, 'critical', 'investigating', NULL, NULL, 3, ago_days(19)),
 (4,  'TN-2026-0004', 'Central Plaza Parking Vehicle Thefts',
      'Four vehicles stolen from Level 2 over two weeks. No forced barrier exits; tickets were validated normally.',
      'theft', ago_date(9), 3, 'medium', 'investigating', NULL, NULL, 2, ago_days(8)),
 (5,  'TN-2026-0005', 'Riverside Cafe Assault',
      'Customer injured in an altercation after a disputed table booking. Suspect left before staff could intervene.',
      'assault', ago_date(3), 6, 'medium', 'open', NULL, NULL, 4, ago_days(3)),
 (6,  'TN-2026-0006', 'Old Railway Underpass Hit-and-Run',
      'Pedestrian struck at 21:10 by a vehicle that did not stop. A bus dashcam captured part of the incident.',
      'hit_and_run', ago_date(2), 7, 'critical', 'open', NULL, NULL, 3, ago_days(2)),
 (7,  'TN-2026-0007', 'City Savings Forged Cheque Ring',
      'Six forged cheques cleared at the main branch using genuine stock stolen from the branch storeroom.',
      'forgery', ago_date(30), 8, 'high', 'suspect_identified', NULL, NULL, 4, ago_days(29)),
 (8,  'TN-2026-0008', 'Greenfield School Vandalism',
      'Spray-paint damage to the east wall and two classrooms over a weekend.',
      'vandalism', ago_date(41), 9, 'low', 'closed', 'solved', ago_days(35), 2, ago_days(40)),
 (9,  'TN-2026-0009', 'Sunrise Apartments Garage Fire',
      'Fire started in the basement garage at 02:40. Fire service found an accelerant container in the stairwell.',
      'arson', ago_date(6), 12, 'high', 'investigating', NULL, NULL, 2, ago_days(6)),
 (10, 'TN-2026-0010', 'BazaarNet Counterfeit Marketplace Scam',
      'Buyers paid for branded electronics that never shipped. Listing photos were copied from other sellers.',
      'cybercrime', ago_date(15), 11, 'medium', 'investigating', NULL, NULL, 4, ago_days(14)),
 (11, 'TN-2026-0011', 'Missing Person: Danish Rehman',
      'Last seen leaving work at 21:00. Phone last connected to a tower covering the Blue Line taxi stand.',
      'missing_person', ago_date(1), 10, 'critical', 'open', NULL, NULL, 1, ago_days(0.1)),
 (12, 'TN-2026-0012', 'Blue Line Taxi Stand Pickpocket Series',
      'Repeated wallet thefts from commuters at peak hours over six weeks.',
      'theft', ago_date(62), 10, 'low', 'closed', 'solved', ago_days(55), 6, ago_days(60)),
 (13, 'TN-2026-0013', 'Gulberg Heights Apartment Break-in',
      'Window latch forced while the occupant was away. Jewellery and a laptop were taken.',
      'burglary', ago_date(18), 2, 'medium', 'suspect_identified', NULL, NULL, 3, ago_days(18)),
 (14, 'TN-2026-0014', 'City Savings ATM Card Skimmer',
      'A card-skimming device was found fitted to the branch ATM during a routine inspection.',
      'fraud', ago_date(4), 8, 'high', 'open', NULL, NULL, 4, ago_days(4)),
 (15, 'TN-2026-0015', 'Warehouse 7 Cargo Pilferage',
      'Pallets of electronics went missing between loading and dispatch over three weeks.',
      'theft', ago_date(52), 5, 'low', 'closed', 'referred_to_court', ago_days(45), 3, ago_days(50)),
 (16, 'TN-2026-0016', 'Station Kiosk Robbery (2024 review)',
      'Review of an unsolved kiosk robbery; no new leads after a full file re-read.',
      'other', ago_date(210), 10, 'medium', 'closed', 'unsolved', ago_days(150), 1, ago_days(200));

INSERT INTO case_investigators (case_id, user_id, role, assigned_by, assigned_at) VALUES
 (1, 2, 'lead', 1, ago_days(12)), (1, 3, 'support', 1, ago_days(11)),
 (2, 4, 'lead', 1, ago_days(24)),
 (3, 3, 'lead', 1, ago_days(19)), (3, 2, 'support', 1, ago_days(18)), (3, 6, 'support', 1, ago_days(18)),
 (4, 2, 'lead', 1, ago_days(8)),
 (5, 4, 'lead', 1, ago_days(3)), (5, 6, 'support', 1, ago_days(3)),
 (6, 3, 'lead', 1, ago_days(2)), (6, 6, 'support', 1, ago_days(2)),
 (7, 4, 'lead', 1, ago_days(29)), (7, 1, 'support', 1, ago_days(29)),
 (8, 2, 'lead', 1, ago_days(40)),
 (9, 2, 'lead', 1, ago_days(6)), (9, 3, 'support', 1, ago_days(5)),
 (10, 4, 'lead', 1, ago_days(14)),
 (11, 1, 'lead', 1, ago_days(0.1)), (11, 3, 'support', 1, ago_days(0.1)), (11, 6, 'support', 1, ago_days(0.1)),
 (12, 6, 'lead', 1, ago_days(60)),
 (13, 3, 'lead', 1, ago_days(18)),
 (14, 4, 'lead', 1, ago_days(4)), (14, 2, 'support', 1, ago_days(3)),
 (15, 3, 'lead', 1, ago_days(50)),
 (16, 1, 'lead', 1, ago_days(200));

INSERT INTO case_notes (case_id, user_id, body, created_at) VALUES
 (1, 2, 'Alarm provider confirms the panel was disarmed with a valid code at 01:52. Requesting the code-holder list.', ago_days(10)),
 (1, 3, 'Rear camera shows one hooded person and possibly a second at the scooter. Footage is low resolution.', ago_days(9)),
 (3, 3, 'Customs confirms the consignee address is a vacant plot. Tracing the importer-of-record.', ago_days(17)),
 (4, 2, 'Same hooded figure pattern as the Harbor Street footage. Linking the two cases for the briefing.', ago_days(6)),
 (9, 2, 'Fire service report received. Accelerant is a petrol-type mixture. Warehouse 7 owner reported a rented vehicle nearby.', ago_days(4)),
 (11, 1, 'Family notified. Requesting telecom records and checking taxi stand cameras.', ago_days(0.1)),
 (7, 1, 'Reviewed with the chief: two signature styles. Possibly two forgers.', ago_days(20));

-- ---------------------------------------------------------------------
-- People
-- ---------------------------------------------------------------------
INSERT INTO suspects (id, suspect_code, full_name, alias, gender, date_of_birth, occupation, physical_description, last_known_address, notes, created_by, created_at) VALUES
 (1,  'SU-0001', 'Rashid Malik',        'Rocky',           'male',    '1989-03-14', 'Freelance locksmith',     'Medium build, scar above left eyebrow.', 'Flat 12, Canal Road',            'Known to local locksmith trade. Association with cases is a lead only.', 2, ago_days(11)),
 (2,  'SU-0002', 'Zain Aslam',          NULL,              'male',    '1992-07-02', 'IT contractor',           'Tall, glasses.',                         'Tower C, Gulberg Heights',      'Had contractor access to the Northfield finance server.', 4, ago_days(23)),
 (3,  'SU-0003', 'Farhan Qadir',        NULL,              'male',    '1985-11-23', 'Delivery driver',         NULL,                                     'House 4, Lane 6, Old Town',     'Cleared in the jewellery case after alibi check.', 3, ago_days(10)),
 (4,  'SU-0004', 'Nadia Chaudhry',      NULL,              'female',  '1990-01-30', 'Former bank clerk',       NULL,                                     'Apartment 3, Maple Court',      'Left City Savings Bank 14 months ago.', 4, ago_days(27)),
 (5,  'SU-0005', 'Tariq Mehmood',       NULL,              'male',    '1978-06-09', 'Import/export agent',     'Heavy build, grey beard.',               'Eastgate Business Centre',      'Importer-of-record on the disputed manifests.', 3, ago_days(18)),
 (6,  'SU-0006', 'Kashif Lodhi',        NULL,              'male',    '1994-09-17', 'Part-time mechanic',      NULL,                                     'Shop 2, Workshop Row',          'Occasional labour at Eastgate Warehouse 7.', 2, ago_days(5)),
 (7,  'SU-0007', 'Sameer Akhtar',       NULL,              'male',    '1987-12-05', 'Courier',                 NULL,                                     'Block 9, Station Colony',       'Owns a silver hatchback (registration under check).', 3, ago_days(2)),
 (8,  'SU-0008', 'Junaid Baig',         NULL,              'male',    '1996-04-21', 'University student',      'Slim, short beard.',                     'Hostel B, North Campus',        'Questioned voluntarily.', 4, ago_days(3)),
 (9,  'SU-0009', 'Hina Sheikh',         NULL,              'female',  '1991-08-11', 'Online seller',           NULL,                                     'Unit 7, Riverside Flats',       'Seller account under review in two cases.', 4, ago_days(13)),
 (10, 'SU-0010', 'Waqas Durrani',       NULL,              'male',    '1983-02-28', 'Unemployed',              NULL,                                     'Room 5, Old Market Lodge',      'Pawned items at Golden Anchor Traders on several dates.', 3, ago_days(9)),
 (11, 'SU-0011', 'Bashir Ahmad',        NULL,              'male',    '1975-05-19', 'Former school caretaker', NULL,                                     'Village Road 3',                'Case closed.', 2, ago_days(39)),
 (12, 'SU-0012', 'Unidentified Subject A', 'Hooded figure', 'unknown', NULL,        NULL,                        'Slim, about 170 cm, dark hooded top, gloves.', NULL,                         'Identity unknown. Appears on CCTV in two cases.', 2, ago_days(11));

INSERT INTO victims (id, victim_code, full_name, victim_type, date_of_birth, phone, email, address, notes, created_by, created_at) VALUES
 (1,  'VI-0001', 'Harbor Street Jewellers',                 'business',    NULL,         '+92 51 0000101', 'owner@harborjewellers.example', '14 Harbor Street, Old Town',        'Owner: Mr. Ismail Raza.', 2, ago_days(12)),
 (2,  'VI-0002', 'Northfield Tech Park Payroll Department', 'institution', NULL,         '+92 51 0000102', 'payroll@northfield.example',    'Northfield Tech Park, Block C',     NULL, 4, ago_days(24)),
 (3,  'VI-0003', 'Zubair Hussain',                          'individual',  '1993-02-10', '+92 300 5550103', NULL,                           'House 18, Garden Town',             'Treated for facial injuries; statement taken.', 4, ago_days(3)),
 (4,  'VI-0004', 'Maria Khan',                              'individual',  '1979-09-25', '+92 300 5550104', NULL,                           'Flat 6, Station Colony',            'Serious injuries; statement pending medical clearance.', 3, ago_days(2)),
 (5,  'VI-0005', 'City Savings Bank',                       'institution', NULL,         '+92 51 0000105', 'security@citysavings.example',  '1 Commerce Avenue',                 NULL, 4, ago_days(29)),
 (6,  'VI-0006', 'Greenfield Public School',                'institution', NULL,         '+92 51 0000106', NULL,                           'Greenfield Road',                   NULL, 2, ago_days(40)),
 (7,  'VI-0007', 'Sunrise Apartments Residents Association','institution', NULL,         NULL,             'committee@sunrise.example',     'Sunrise Apartments, Canal View',    NULL, 2, ago_days(6)),
 (8,  'VI-0008', 'Danish Rehman',                           'individual',  '1998-06-30', '+92 300 5550108', NULL,                           'Apartment 12, Maple Court',         'Reported missing by his sister.', 1, ago_days(0.1)),
 (9,  'VI-0009', 'Layla Farooqi',                           'individual',  '1990-12-12', '+92 300 5550109', 'layla.f@mail.example',       'Gulberg Heights, Tower B, 5B',      'Victim in two separate cases.', 3, ago_days(17)),
 (10, 'VI-0010', 'Ali Noor Trading Co.',                    'business',    NULL,         '+92 51 0000110', NULL,                           'Eastgate Industrial Estate',        'Owner of the stored cargo.', 3, ago_days(19)),
 (11, 'VI-0011', 'Nawaz Pervez',                            'individual',  '1982-04-04', '+92 300 5550111', NULL,                           'House 2, Lane 3, Old Town',         'One of four vehicle owners.', 2, ago_days(8));

INSERT INTO witnesses (id, witness_code, full_name, occupation, phone, email, address, is_protected, notes, created_by, created_at) VALUES
 (1,  'WI-0001', 'Imran Shah',        'Security guard',        '+92 300 5550201', NULL,                       'Quarters 3, Old Town',        0, 'On duty at Harbor Street and at Central Plaza on different shifts.', 2, ago_days(12)),
 (2,  'WI-0002', 'Sadia Rauf',        'Cafe waitress',         '+92 300 5550202', NULL,                       'Flat 2, Riverside Flats',     0, NULL, 4, ago_days(3)),
 (3,  'WI-0003', 'Dr. Parveen Ali',   'Physician',             '+92 300 5550203', 'p.ali@clinic.example',     'City Clinic, Station Road',   0, 'Gave first aid at the scene.', 3, ago_days(2)),
 (4,  'WI-0004', 'Kabir Hassan',      'Taxi driver',           '+92 300 5550204', NULL,                       'Taxi Colony 11',              0, 'Operates from the Blue Line stand.', 3, ago_days(2)),
 (5,  'WI-0005', 'Noreen Akhtar',     'Neighbour',             '+92 300 5550205', NULL,                       'Gulberg Heights, Tower B, 5A',0, NULL, 3, ago_days(17)),
 (6,  'WI-0006', 'Asif Mirza',        'Night watchman',        '+92 300 5550206', NULL,                       'Eastgate Staff Quarters',     1, 'Protected witness: contact details restricted.', 3, ago_days(19)),
 (7,  'WI-0007', 'Rabia Siddiqui',    'Bank teller',           '+92 300 5550207', 'rabia.s@citysavings.example','Flat 8, Maple Court',        0, NULL, 4, ago_days(29)),
 (8,  'WI-0008', 'Hassan Javed',      'IT administrator',      '+92 300 5550208', 'h.javed@northfield.example','Block 4, Tech Colony',        0, NULL, 4, ago_days(23)),
 (9,  'WI-0009', 'Tahir Mahmood',     'Kiosk vendor',          '+92 300 5550209', NULL,                       'Stall 5, Blue Line stand',    0, NULL, 6, ago_days(60)),
 (10, 'WI-0010', 'Salma Bibi',        'Apartment caretaker',   '+92 300 5550210', NULL,                       'Sunrise Apartments, Annex',   1, 'Protected witness: contact details restricted.', 2, ago_days(6)),
 (11, 'WI-0011', 'Faisal Ibrahim',    'School janitor',        '+92 300 5550211', NULL,                       'Greenfield Road 9',           0, NULL, 2, ago_days(40)),
 (12, 'WI-0012', 'Anwar Baloch',      'Courier driver',        '+92 300 5550212', NULL,                       'Truck Stand, Eastgate',       0, NULL, 3, ago_days(19));

INSERT INTO case_suspects (case_id, suspect_id, involvement_status, notes, linked_by, linked_at) VALUES
 (1, 1,  'person_of_interest',  'Locksmith skills; seen near Old Town the week before.', 2, ago_days(11)),
 (1, 12, 'person_of_interest',  'Hooded figure on rear-door CCTV.', 2, ago_days(11)),
 (1, 3,  'cleared',             'Verified alibi: on a delivery route with GPS logs.', 3, ago_days(10)),
 (2, 2,  'under_investigation', 'Laptop MAC address matches the file-modification log.', 4, ago_days(22)),
 (3, 1,  'under_investigation', 'Seen at Eastgate Warehouse 7 on two evenings.', 3, ago_days(17)),
 (3, 5,  'charged',             'Charged with falsifying customs documents. Charge is not a finding of guilt.', 3, ago_days(10)),
 (4, 1,  'questioned',          'Interviewed; denied being at Central Plaza.', 2, ago_days(6)),
 (4, 12, 'person_of_interest',  'Same hooded figure pattern as the Harbor Street case.', 2, ago_days(6)),
 (5, 8,  'questioned',          'Attended voluntarily with counsel.', 4, ago_days(2)),
 (6, 7,  'person_of_interest',  'Owns a silver hatchback. Vehicle inspection requested.', 3, ago_days(1)),
 (7, 2,  'person_of_interest',  'Acquaintance of the former clerk.', 4, ago_days(26)),
 (7, 4,  'questioned',          'Former employee with storeroom knowledge.', 4, ago_days(26)),
 (8, 11, 'charged',             'Admitted to the damage; case closed.', 2, ago_days(36)),
 (9, 6,  'person_of_interest',  'Mechanic with access to solvents; seen at Eastgate.', 2, ago_days(4)),
 (9, 5,  'person_of_interest',  'Owner of Warehouse 7 cargo; possible motive (insurance).', 3, ago_days(4)),
 (10, 9, 'under_investigation', 'Seller account owner.', 4, ago_days(12)),
 (10, 2, 'person_of_interest',  'Payment account opened with his ID.', 4, ago_days(11)),
 (12, 10,'charged',             'Charged after repeated identification by market vendors.', 6, ago_days(56)),
 (13, 3, 'questioned',          'Delivery route passes the tower.', 3, ago_days(15)),
 (13, 10,'person_of_interest',  'Pawned matching items at Golden Anchor Traders.', 3, ago_days(9)),
 (14, 9, 'person_of_interest',  'Previously linked to a similar device.', 4, ago_days(3)),
 (14, 4, 'person_of_interest',  'Knowledge of ATM servicing schedule.', 4, ago_days(3)),
 (15, 3, 'charged',             'Charged with theft of cargo.', 3, ago_days(46)),
 (16, 10,'cleared',             'Eliminated during the 2024 review.', 1, ago_days(160));

INSERT INTO case_victims (case_id, victim_id, harm_summary, notes, linked_by, linked_at) VALUES
 (1, 1, 'Loss of stock valued at an estimated PKR 8.4 million.', NULL, 2, ago_days(12)),
 (2, 2, 'Fourteen salaries diverted (PKR 2.1 million).', NULL, 4, ago_days(24)),
 (3, 10,'Cargo held in customs; delayed shipments.', NULL, 3, ago_days(19)),
 (4, 11,'Vehicle stolen.', NULL, 2, ago_days(8)),
 (5, 3, 'Facial injuries, treated at hospital.', NULL, 4, ago_days(3)),
 (6, 4, 'Multiple fractures; in hospital.', NULL, 3, ago_days(2)),
 (7, 5, 'Fraudulent withdrawals of PKR 1.3 million.', NULL, 4, ago_days(29)),
 (8, 6, 'Property damage.', NULL, 2, ago_days(40)),
 (9, 7, 'Structural and vehicle damage in the garage.', NULL, 2, ago_days(6)),
 (10, 9,'Paid PKR 145,000 for undelivered goods.', NULL, 4, ago_days(14)),
 (11, 8,'Missing person.', NULL, 1, ago_days(0.1)),
 (13, 9,'Jewellery and laptop stolen.', NULL, 3, ago_days(18)),
 (14, 5,'Card data at risk; branch exposure.', NULL, 4, ago_days(4)),
 (15, 10,'Cargo losses over three weeks.', NULL, 3, ago_days(50));

INSERT INTO case_witnesses (case_id, witness_id, statement_summary, interview_date, follow_up_status, notes, linked_by, linked_at) VALUES
 (1, 1, 'Saw a scooter with a taped number plate leave the lane at about 02:10.', ago_date(11), 'scheduled', 'Photo array planned.', 2, ago_days(11)),
 (2, 8, 'Confirms the contractor account was used outside business hours.', ago_date(22), 'completed', NULL, 4, ago_days(22)),
 (3, 6, 'Saw an unmarked van at about 03:00 and heard a forklift.', ago_date(18), 'pending', 'Needs protection review before further contact.', 3, ago_days(18)),
 (3, 12,'Delivered two pallets on the same night under a different consignee name.', ago_date(17), 'completed', NULL, 3, ago_days(17)),
 (4, 1, 'On shift at Level 2 on one theft night; saw a dark hooded person near bay 14.', ago_date(7), 'scheduled', NULL, 2, ago_days(7)),
 (5, 2, 'Heard a disagreement over a table reservation before the blow.', ago_date(3), 'completed', NULL, 4, ago_days(3)),
 (6, 3, 'Gave first aid; saw headlights swing away without braking.', ago_date(2), 'completed', NULL, 3, ago_days(2)),
 (6, 4, 'Noticed a silver hatchback leaving Station Road at speed.', ago_date(1), 'pending', 'Could not recall the number plate.', 3, ago_days(1)),
 (7, 7, 'Processed two of the cheques; recalls the signature looked rushed.', ago_date(27), 'completed', NULL, 4, ago_days(27)),
 (8, 11,'Found the damage on Monday morning.', ago_date(40), 'none_needed', NULL, 2, ago_days(40)),
 (9, 6, 'Watchman reports a rented sedan parked near the garage ramp before the fire.', ago_date(5), 'scheduled', NULL, 2, ago_days(5)),
 (9, 10,'Heard a bang and smelled fuel before the alarm.', ago_date(5), 'completed', NULL, 2, ago_days(5)),
 (10,8, 'Reviewed the listing metadata for the investigation.', ago_date(13), 'completed', NULL, 4, ago_days(13)),
 (11,4, 'Believes he gave the missing man a ride from the taxi stand at about 21:40.', ago_date(0), 'scheduled', NULL, 1, ago_days(0.4)),
 (12,9, 'Identified the pickpocket from the kiosk.', ago_date(58), 'completed', NULL, 6, ago_days(58)),
 (13,5, 'Heard a window latch rattle at about 14:00.', ago_date(17), 'completed', NULL, 3, ago_days(17)),
 (14,7, 'Noticed the ATM card slot looked slightly raised.', ago_date(3), 'completed', NULL, 4, ago_days(3));

-- ---------------------------------------------------------------------
-- Evidence (chain of custody rows are generated below)
-- ---------------------------------------------------------------------
INSERT INTO evidence (id, evidence_code, case_id, title, description, category, collected_at, collected_location_id, collected_by, status, current_custodian_id, storage_location, created_at) VALUES
 (1,  'EV-2026-0001', 1,  'Steel crowbar',                       '90 cm crowbar left in the rear lane; fresh paint transfer.',             'physical',    ago_days(12),   1,  2, 'in_storage',  5, 'Locker A-12', ago_days(12)),
 (2,  'EV-2026-0002', 1,  'Rear-door CCTV export',               '3 hours of footage around the incident time (H.264, 720p).',             'digital',     ago_days(11),   1,  2, 'in_analysis', 4, 'Digital lab', ago_days(11)),
 (3,  'EV-2026-0003', 1,  'Glove print lift: display case',      'Partial glove-texture lift taken from case 3.',                          'trace',       ago_days(12),   1,  2, 'in_analysis', 6, 'Forensics bench 2', ago_days(12)),
 (4,  'EV-2026-0004', 1,  'Alarm panel event log',               'Event log downloaded from the alarm panel.',                             'digital',     ago_days(11.5), 1,  2, 'in_storage',  5, 'Digital shelf D-3', ago_days(11)),
 (5,  'EV-2026-0005', 2,  'Payroll export (altered file)',       'CSV export with 14 beneficiary account numbers changed.',                'financial',   ago_days(24),   4,  4, 'in_analysis', 4, 'Digital lab', ago_days(24)),
 (6,  'EV-2026-0006', 2,  'Finance server authentication logs',  'Authentication logs for the payroll week.',                              'digital',     ago_days(24),   4,  4, 'in_storage',  5, 'Digital shelf D-1', ago_days(24)),
 (7,  'EV-2026-0007', 3,  'Cargo manifests (three sets)',        'Paper manifests listing consignee Meridian Trade Link.',                 'documentary', ago_days(19),   5,  3, 'in_storage',  5, 'Cabinet C-4', ago_days(19)),
 (8,  'EV-2026-0008', 3,  'Packaging samples with residue',      'Swabbed packaging fragments from three pallets.',                        'physical',    ago_days(19),   5,  3, 'in_analysis', 6, 'Forensics bench 1', ago_days(19)),
 (9,  'EV-2026-0009', 3,  'Seized mobile phone (T. Mehmood)',    'Locked handset seized under warrant. Extraction pending.',               'digital',     ago_days(18),   5,  3, 'in_storage',  5, 'Locker B-02', ago_days(18)),
 (10, 'EV-2026-0010', 4,  'Level 2 exit ticket log',             'Printout of exit barrier events for the four theft nights.',             'documentary', ago_days(8),    3,  2, 'in_storage',  5, 'Cabinet C-6', ago_days(8)),
 (11, 'EV-2026-0011', 4,  'Tyre-track cast, bay 14',             'Plaster cast of a partial tyre impression.',                             'trace',       ago_days(8),    3,  2, 'in_storage',  5, 'Locker A-15', ago_days(8)),
 (12, 'EV-2026-0012', 4,  'Level 2 CCTV footage',                'Four nights of footage, motion-triggered.',                              'digital',     ago_days(7),    3,  2, 'in_analysis', 4, 'Digital lab', ago_days(7)),
 (13, 'EV-2026-0013', 5,  'Broken glass bottle',                 'Fragments bagged at the table; possible prints.',                        'physical',    ago_days(3),    6,  4, 'in_storage',  5, 'Locker A-18', ago_days(3)),
 (14, 'EV-2026-0014', 5,  'Cafe CCTV export',                    'Interior camera 2, 20 minutes either side of the incident.',             'digital',     ago_days(3),    6,  4, 'in_storage',  5, 'Digital shelf D-4', ago_days(3)),
 (15, 'EV-2026-0015', 6,  'Paint fragments from roadway',        'Silver paint flakes and a headlight lens fragment.',                     'trace',       ago_days(2),    7,  3, 'in_analysis', 6, 'Forensics bench 3', ago_days(2)),
 (16, 'EV-2026-0016', 6,  'Bus dashcam footage',                 'Forward-facing dashcam from bus 14.',                                    'digital',     ago_days(2),    7,  3, 'in_storage',  5, 'Digital shelf D-5', ago_days(2)),
 (17, 'EV-2026-0017', 7,  'Forged cheques (six)',                'Original paper cheques returned by the clearing house.',                 'documentary', ago_days(28),   8,  4, 'in_storage',  5, 'Cabinet C-2', ago_days(28)),
 (18, 'EV-2026-0018', 7,  'Ink and pen-pressure report',         'Document examiner report comparing the six signatures.',                 'documentary', ago_days(20),   8,  4, 'in_analysis', 4, 'Case file', ago_days(20)),
 (19, 'EV-2026-0019', 9,  'Accelerant residue sample',           'Debris sample from the stairwell landing.',                              'trace',       ago_days(5),    12, 2, 'in_analysis', 6, 'Forensics bench 1', ago_days(5)),
 (20, 'EV-2026-0020', 9,  'Fire investigator report',            'Origin-and-cause report from the fire service.',                         'documentary', ago_days(4),    12, 2, 'in_storage',  5, 'Cabinet C-7', ago_days(4)),
 (21, 'EV-2026-0021', 10, 'Seller account export',               'Account and listing metadata supplied by the platform.',                 'digital',     ago_days(14),   11, 4, 'in_storage',  5, 'Digital shelf D-2', ago_days(14)),
 (22, 'EV-2026-0022', 10, 'Buyer chat screenshots',              'Screenshots supplied by the victim.',                                    'digital',     ago_days(1),    11, 4, 'collected',   4, NULL, ago_days(1)),
 (23, 'EV-2026-0023', 13, 'Window frame fingerprint',            'Latent print lifted from the window frame.',                             'trace',       ago_days(17),   2,  3, 'in_storage',  5, 'Locker A-09', ago_days(17)),
 (24, 'EV-2026-0024', 13, 'Pawn receipt, Golden Anchor Traders', 'Receipt listing a ring and a watch.',                                    'financial',   ago_days(10),   13, 3, 'in_storage',  5, 'Cabinet C-3', ago_days(10)),
 (25, 'EV-2026-0025', 14, 'Skimmer device from ATM',             'Overlay skimmer and pinhole camera recovered intact.',                   'physical',    ago_days(4),    8,  4, 'in_storage',  5, 'Locker B-05', ago_days(4)),
 (26, 'EV-2026-0026', 8,  'Spray-paint cans',                    'Four cans found behind the gym.',                                        'physical',    ago_days(40),   9,  2, 'released',    5, 'Released to court', ago_days(40)),
 (27, 'EV-2026-0027', 12, 'Pickpocket CCTV stills',              'Stills from the stand camera used for identification.',                  'digital',     ago_days(59),   10, 6, 'released',    5, 'Released to court', ago_days(59)),
 (28, 'EV-2026-0028', 11, 'Missing person''s phone record',       'Telecom last-connection summary.',                                       'digital',     ago_days(0.2),  10, 1, 'in_storage',  5, 'Digital shelf D-6', ago_days(0.2));

-- Custody chain, generated so every item has an unbroken, valid ledger.
--   seq 1: intake by the collecting officer
--   seq 2: handed to the evidence officer (user 5) unless still with the collector
--   seq 3: signed out by the current custodian (analysis, lab) unless already with the evidence officer
INSERT INTO custody_log (evidence_id, seq, from_custodian_id, to_custodian_id, transferred_by, reason, storage_location, transferred_at)
SELECT id, 1, NULL, collected_by, collected_by, 'Collected at scene and logged', NULL, collected_at FROM evidence;

INSERT INTO custody_log (evidence_id, seq, from_custodian_id, to_custodian_id, transferred_by, reason, storage_location, transferred_at)
SELECT id, 2, collected_by, 5, 5, 'Submitted to the evidence room for storage', storage_location,
       strftime('%Y-%m-%dT%H:%M:%SZ', collected_at, '+3 hours')
  FROM evidence WHERE current_custodian_id <> collected_by;

INSERT INTO custody_log (evidence_id, seq, from_custodian_id, to_custodian_id, transferred_by, reason, storage_location, transferred_at)
SELECT id, 3, 5, current_custodian_id, 5, 'Signed out for examination', storage_location,
       strftime('%Y-%m-%dT%H:%M:%SZ', collected_at, '+1 day')
  FROM evidence WHERE current_custodian_id NOT IN (collected_by, 5);

-- ---------------------------------------------------------------------
-- Clues
-- ---------------------------------------------------------------------
INSERT INTO clues (id, clue_code, case_id, title, description, source, discovered_at, location_id, confidence, status, created_by, created_at) VALUES
 (1,  'CL-0001', 1,  'Lock-pick set visible near the rear door',       'A roll of picks is visible at the figure''s belt in frame 214.',             'CCTV review',            ago_date(11), 1,    'medium',     'under_review', 2, ago_days(11)),
 (2,  'CL-0002', 1,  'Scooter with taped number plate',                'Witness saw a scooter leave the lane; the plate was covered with tape.',     'Witness: I. Shah',       ago_date(12), 1,    'medium',     'under_review', 2, ago_days(12)),
 (3,  'CL-0003', 1,  'Stolen ring offered on the second-hand market',  'A ring matching the jewellery inventory was offered for sale.',              'Informant tip',          ago_date(9),  13,   'low',        'new',          3, ago_days(9)),
 (4,  'CL-0004', 2,  'Payroll file edited at 02:14 from a contractor laptop', 'File-modification metadata points to a contractor-issued laptop.',      'Server logs',            ago_date(23), 4,    'high',       'corroborated', 4, ago_days(23)),
 (5,  'CL-0005', 2,  'Beneficiary account opened three days earlier',  'The receiving account was opened shortly before the payroll run.',           'Bank records',           ago_date(22), NULL, 'medium',     'under_review', 4, ago_days(22)),
 (6,  'CL-0006', 3,  'Consignee on the manifests does not exist',      'No registration found for Meridian Trade Link.',                             'Customs trace',          ago_date(18), 5,    'high',       'corroborated', 3, ago_days(18)),
 (7,  'CL-0007', 3,  'Unmarked van at 03:00',                          'Night watchman saw an unmarked panel van load pallets.',                     'Witness: A. Mirza',      ago_date(19), 5,    'medium',     'under_review', 3, ago_days(19)),
 (8,  'CL-0008', 4,  'Same hooded figure as the jewellery CCTV',       'Gait and clothing resemble the figure in the Harbor Street footage.',        'CCTV comparison',        ago_date(7),  3,    'medium',     'under_review', 2, ago_days(7)),
 (9,  'CL-0009', 4,  'Tyre pattern consistent with a panel van',       'Tread width suggests a light commercial vehicle.',                           'Forensic note',          ago_date(7),  3,    'low',        'new',          2, ago_days(7)),
 (10, 'CL-0010', 5,  'Argument over a table booking',                  'Waitress heard a dispute involving a younger man shortly before the blow.',  'Witness: S. Rauf',       ago_date(3),  6,    'medium',     'new',          4, ago_days(3)),
 (11, 'CL-0011', 6,  'Silver hatchback with a damaged left headlight', 'Dashcam shows a silver hatchback with a cracked left headlight leaving.',  'Bus dashcam',            ago_date(2),  7,    'high',       'under_review', 3, ago_days(2)),
 (12, 'CL-0012', 7,  'Signature pen-pressure pattern shared',          'Examiner notes the same pressure pattern across four cheques.',              'Document examiner',      ago_date(28), 8,    'medium',     'under_review', 4, ago_days(28)),
 (13, 'CL-0013', 7,  'Cheque stock taken from the branch storeroom',   'Serial numbers match a booklet that went missing 15 months ago.',            'Bank audit',             ago_date(27), 8,    'high',       'corroborated', 4, ago_days(27)),
 (14, 'CL-0014', 9,  'Accelerant container in the stairwell',          'Plastic 5L container, partially melted, with a petrol-type residue.',         'Fire service',           ago_date(5),  12,   'high',       'corroborated', 2, ago_days(5)),
 (15, 'CL-0015', 9,  'Warehouse 7 owner''s rented sedan seen near the garage', 'Neighbour reports a rented sedan idling at the garage ramp.',      'Neighbour report',       ago_date(5),  12,   'low',        'new',          2, ago_days(4)),
 (16, 'CL-0016', 10, 'Seller photos reused from other listings',       'Reverse image search matches three unrelated sellers.',                      'Platform review',        ago_date(14), 11,   'high',       'corroborated', 4, ago_days(14)),
 (17, 'CL-0017', 10, 'Payment routed to an account opened with Z. Aslam''s ID', 'Receiving account holder details match an ID used in another case.', 'Bank records',          ago_date(12), NULL, 'medium',     'under_review', 4, ago_days(12)),
 (18, 'CL-0018', 13, 'Pawned ring matches stolen item',                'Engraving inside the band matches the owner''s description.',                'Pawn shop inspection',   ago_date(9),  13,   'medium',     'under_review', 3, ago_days(9)),
 (19, 'CL-0019', 13, 'Window latch forced from outside',               'Tool marks on the latch consistent with a thin lever.',                      'Crime scene unit',       ago_date(17), 2,    'high',       'corroborated', 3, ago_days(17)),
 (20, 'CL-0020', 14, 'Skimmer model matches an earlier incident',      'Same overlay design as a device recovered in a previous investigation.',     'Technical analysis',     ago_date(3),  8,    'medium',     'new',          4, ago_days(3)),
 (21, 'CL-0021', 11, 'Last phone ping near the taxi stand',            'Final connection was to a tower covering the Blue Line stand at 21:35.',     'Telecom request',        ago_date(0),  10,   'medium',     'under_review', 1, ago_days(0.3)),
 (22, 'CL-0022', 11, 'Taxi driver recalls a 21:40 pickup',             'Driver believes the pickup matched the missing man''s description.',         'Witness: K. Hassan',     ago_date(0),  10,   'low',        'new',          3, ago_days(0.5)),
 (23, 'CL-0023', 3,  'Residue consistent with counterfeit pharmaceuticals', 'Preliminary screening of the packaging swabs.',                        'Forensic screening',     ago_date(17), 5,    'medium',     'corroborated', 3, ago_days(17));

-- ---------------------------------------------------------------------
-- Recorded relationships (leads, not proven facts). a_type < b_type alphabetically.
-- ---------------------------------------------------------------------
INSERT INTO relationships (a_type, a_id, b_type, b_id, relation_type, description, source, confidence, created_by, created_at) VALUES
 ('clue', 8, 'suspect', 12, 'points_to',  'Gait and clothing match the Harbor Street footage.', 'CCTV comparison', 'medium', 2, ago_days(6)),
 ('clue', 1, 'suspect', 12, 'points_to',  'The lock-pick roll is visible on the same figure.', 'CCTV review', 'low', 2, ago_days(10)),
 ('clue', 2, 'suspect', 1,  'points_to',  'Scooter resembles one seen outside Rashid Malik''s workshop.', 'Surveillance note', 'low', 2, ago_days(9)),
 ('clue', 2, 'witness', 1,  'identified_by', 'Imran Shah described the taped plate.', 'Witness statement', 'medium', 2, ago_days(11)),
 ('evidence', 1, 'suspect', 1,  'points_to',  'Tool-mark comparison with locksmith tools requested.', 'Forensic request', 'low', 2, ago_days(8)),
 ('evidence', 3, 'suspect', 1,  'points_to',  'Glove texture pending comparison.', 'Forensic request', 'unverified', 2, ago_days(8)),
 ('evidence', 2, 'suspect', 12, 'points_to',  'Hooded figure visible at the rear door.', 'CCTV review', 'high', 2, ago_days(10)),
 ('suspect', 1, 'witness', 1, 'identified_by', 'Photo array scheduled; no positive identification yet.', 'Planned', 'unverified', 2, ago_days(7)),
 ('case', 1, 'case', 13, 'related_case',  'Items from both cases were offered through Golden Anchor Traders.', 'Pawn shop records', 'low', 3, ago_days(8)),
 ('case', 1, 'case', 4,  'related_case',  'Same unidentified subject appears in the CCTV of both cases.', 'CCTV comparison', 'medium', 2, ago_days(6)),
 ('case', 3, 'case', 9,  'related_case',  'Suspect Kashif Lodhi works at Warehouse 7; owner has a possible motive.', 'Interview notes', 'low', 2, ago_days(4)),
 ('case', 2, 'case', 10, 'related_case',  'Same person''s ID used to open both receiving accounts.', 'Bank records', 'medium', 4, ago_days(11)),
 ('case', 4, 'clue', 2,   'related_case', 'Scooter used in the burglary may be the lookout vehicle here.', 'Team briefing', 'low', 2, ago_days(5)),
 ('case', 9, 'evidence', 8, 'related_case', 'Solvent composition may match the packaging residue from the warehouse.', 'Lab note', 'low', 2, ago_days(3)),
 ('clue', 4, 'suspect', 2,  'points_to', 'Contractor laptop assigned to Zain Aslam.', 'Server logs', 'high', 4, ago_days(22)),
 ('clue', 5, 'suspect', 2,  'points_to', 'Account opening used Zain Aslam''s ID.', 'Bank records', 'medium', 4, ago_days(21)),
 ('clue', 17,'suspect', 2,  'points_to', 'Same ID as in the payroll case.', 'Bank records', 'medium', 4, ago_days(11)),
 ('clue', 4, 'clue', 5,     'corroborates', 'Timeline of the edit and the account opening fit together.', 'Analyst note', 'medium', 4, ago_days(21)),
 ('clue', 5, 'clue', 17,    'corroborates', 'Same account-opening method in both cases.', 'Analyst note', 'medium', 4, ago_days(11)),
 ('evidence', 5, 'suspect', 2, 'points_to', 'Altered file originated on his laptop.', 'Forensic analysis', 'high', 4, ago_days(20)),
 ('suspect', 2, 'witness', 8, 'identified_by', 'Hassan Javed identified the contractor account owner.', 'Witness statement', 'high', 4, ago_days(22)),
 ('evidence', 9, 'suspect', 5, 'belongs_to', 'Phone seized from Tariq Mehmood under warrant.', 'Seizure record', 'high', 3, ago_days(18)),
 ('evidence', 7, 'suspect', 5, 'points_to', 'Manifests list his firm as importer-of-record.', 'Customs trace', 'high', 3, ago_days(17)),
 ('clue', 6, 'clue', 23,    'corroborates', 'Fictitious consignee and pharmaceutical residue fit a counterfeit-goods pattern.', 'Analyst note', 'medium', 3, ago_days(16)),
 ('clue', 7, 'witness', 6,  'identified_by', 'Observed by the night watchman.', 'Witness statement', 'medium', 3, ago_days(18)),
 ('clue', 9, 'evidence', 11,'corroborates', 'Cast and tread description agree.', 'Forensic note', 'low', 2, ago_days(7)),
 ('clue', 7, 'clue', 9,     'corroborates', 'Unmarked panel van at the warehouse and panel-van tyre width at Central Plaza.', 'Team briefing', 'low', 2, ago_days(6)),
 ('clue', 11,'suspect', 7,  'points_to', 'Sameer Akhtar owns a silver hatchback.', 'Vehicle records', 'medium', 3, ago_days(1)),
 ('evidence', 16,'suspect', 7, 'points_to', 'Partial plate on the dashcam under enhancement.', 'Video enhancement', 'low', 3, ago_days(1)),
 ('clue', 11,'evidence', 15,'corroborates', 'Paint colour matches the damaged hatchback description.', 'Forensic note', 'low', 3, ago_days(1)),
 ('clue', 12,'suspect', 4,  'points_to', 'Pen-pressure pattern resembles samples from former staff.', 'Document examiner', 'medium', 4, ago_days(27)),
 ('clue', 13,'suspect', 4,  'points_to', 'Former clerk with storeroom access.', 'Bank audit', 'low', 4, ago_days(26)),
 ('evidence', 17,'suspect', 4, 'points_to', 'Handwriting comparison requested.', 'Forensic request', 'low', 4, ago_days(25)),
 ('suspect', 2, 'suspect', 4, 'acquainted_with', 'Former colleagues who share a flat building.', 'Interview notes', 'medium', 4, ago_days(25)),
 ('suspect', 4, 'suspect', 9, 'acquainted_with', 'Messages between the two found during review.', 'Phone records', 'low', 4, ago_days(3)),
 ('suspect', 9, 'victim', 9,  'acquainted_with', 'Hina Sheikh and Layla Farooqi appear in the same group chat.', 'Platform review', 'low', 4, ago_days(10)),
 ('clue', 14,'suspect', 6,  'points_to', 'Mechanic with access to solvents.', 'Interview notes', 'low', 2, ago_days(4)),
 ('clue', 15,'suspect', 5,  'points_to', 'Rented sedan registered to a firm linked to Tariq Mehmood.', 'Vehicle records', 'low', 2, ago_days(4)),
 ('evidence', 19,'suspect', 6, 'points_to', 'Residue pending comparison with workshop solvents.', 'Lab request', 'unverified', 2, ago_days(3)),
 ('suspect', 5, 'suspect', 6, 'acquainted_with', 'Kashif Lodhi does casual work at Warehouse 7.', 'Interview notes', 'medium', 3, ago_days(4)),
 ('location', 5, 'suspect', 6, 'seen_at', 'Observed leaving Eastgate Warehouse 7 at night.', 'Surveillance', 'low', 3, ago_days(4)),
 ('location', 5, 'suspect', 1, 'seen_at', 'Seen at Warehouse 7 on two evenings.', 'Surveillance', 'medium', 3, ago_days(16)),
 ('clue', 16,'suspect', 9,  'points_to', 'Seller account is registered to Hina Sheikh.', 'Platform review', 'medium', 4, ago_days(13)),
 ('evidence', 25,'suspect', 9, 'points_to', 'Device design matches an earlier fraud device linked to her.', 'Technical analysis', 'low', 4, ago_days(3)),
 ('clue', 18,'evidence', 24, 'corroborates', 'Receipt lists the same ring.', 'Pawn shop inspection', 'high', 3, ago_days(9)),
 ('evidence', 24,'suspect', 10, 'points_to', 'Receipt signed by Waqas Durrani.', 'Pawn shop records', 'medium', 3, ago_days(9)),
 ('evidence', 23,'suspect', 3,  'points_to', 'Partial latent print; comparison pending.', 'Forensic request', 'unverified', 3, ago_days(14)),
 ('suspect', 3, 'witness', 5, 'identified_by', 'Neighbour recalls a delivery driver in the corridor.', 'Witness statement', 'low', 3, ago_days(14)),
 ('clue', 22,'witness', 4,  'identified_by', 'Kabir Hassan recalls the 21:40 pickup.', 'Witness statement', 'low', 3, ago_days(0.5)),
 ('clue', 21,'location', 10,'mentions', 'Last ping falls inside the taxi stand coverage area.', 'Telecom request', 'medium', 1, ago_days(0.3)),
 ('clue', 10,'suspect', 8,  'mentions', 'The younger man in the dispute matches Junaid Baig.', 'Witness statement', 'medium', 4, ago_days(2)),
 ('evidence', 14,'suspect', 8, 'points_to', 'Interior camera shows him at the table.', 'CCTV review', 'medium', 4, ago_days(2)),
 ('evidence', 13,'suspect', 8, 'points_to', 'Latent prints on the bottle pending comparison.', 'Forensic request', 'unverified', 4, ago_days(2));

-- ---------------------------------------------------------------------
-- Audit trail: derive a realistic activity history from the records above
-- ---------------------------------------------------------------------
INSERT INTO audit_log (user_id, action, entity_type, entity_id, case_id, summary, created_at)
SELECT created_by, 'case.create', 'case', id, id, 'Opened case ' || case_number || ': ' || title, created_at FROM cases;

INSERT INTO audit_log (user_id, action, entity_type, entity_id, case_id, summary, created_at)
SELECT closed_by.created_by, 'case.status', 'case', c.id, c.id,
       'Closed case ' || c.case_number || ' (' || replace(c.resolution, '_', ' ') || ')', c.closed_at
  FROM cases c JOIN (SELECT id, created_by FROM cases) closed_by ON closed_by.id = c.id
 WHERE c.status = 'closed';

INSERT INTO audit_log (user_id, action, entity_type, entity_id, case_id, summary, created_at)
SELECT collected_by, 'evidence.create', 'evidence', id, case_id, 'Logged evidence ' || evidence_code || ': ' || title, created_at FROM evidence;

INSERT INTO audit_log (user_id, action, entity_type, entity_id, case_id, summary, created_at)
SELECT l.transferred_by, 'custody.transfer', 'evidence', l.evidence_id, e.case_id,
       'Custody of ' || e.evidence_code || ' moved to ' || u.full_name, l.transferred_at
  FROM custody_log l JOIN evidence e ON e.id = l.evidence_id JOIN users u ON u.id = l.to_custodian_id
 WHERE l.seq > 1;

INSERT INTO audit_log (user_id, action, entity_type, entity_id, case_id, summary, created_at)
SELECT created_by, 'clue.create', 'clue', id, case_id, 'Recorded clue ' || clue_code || ': ' || title, created_at FROM clues;

INSERT INTO audit_log (user_id, action, entity_type, entity_id, case_id, summary, created_at)
SELECT created_by, 'relationship.create', 'relationship', id, NULL,
       'Linked ' || a_type || ' #' || a_id || ' and ' || b_type || ' #' || b_id || ' (' || relation_type || ')', created_at FROM relationships;

-- ---------------------------------------------------------------------
-- Finish: closed cases get their real update times; archive the review case last
-- (archived cases refuse new linked records, so it is archived after all inserts).
-- ---------------------------------------------------------------------
UPDATE cases SET updated_at = ago_days(1.0)  WHERE id = 1;
UPDATE cases SET updated_at = ago_days(2.0)  WHERE id = 2;
UPDATE cases SET updated_at = ago_days(0.5)  WHERE id = 3;
UPDATE cases SET updated_at = ago_days(3.0)  WHERE id = 4;
UPDATE cases SET updated_at = ago_days(0.3)  WHERE id = 5;
UPDATE cases SET updated_at = ago_days(0.2)  WHERE id = 6;
UPDATE cases SET updated_at = ago_days(5.0)  WHERE id = 7;
UPDATE cases SET updated_at = ago_days(35.0) WHERE id = 8;
UPDATE cases SET updated_at = ago_days(0.7)  WHERE id = 9;
UPDATE cases SET updated_at = ago_days(4.0)  WHERE id = 10;
UPDATE cases SET updated_at = ago_days(0.05) WHERE id = 11;
UPDATE cases SET updated_at = ago_days(55.0) WHERE id = 12;
UPDATE cases SET updated_at = ago_days(6.0)  WHERE id = 13;
UPDATE cases SET updated_at = ago_days(1.5)  WHERE id = 14;
UPDATE cases SET updated_at = ago_days(45.0) WHERE id = 15;
UPDATE cases SET is_archived = 1, archived_at = ago_days(120), updated_at = ago_days(120) WHERE id = 16;
