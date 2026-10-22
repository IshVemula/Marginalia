'use strict';

/* A workspace in the same shape the site saves, built around Thursday 2026-10-22 ("today" in the tests). */

const TODAY = '2026-10-22';       // a Thursday (weekday 4; the site stores Sunday as 0)

function sampleWorkspace() {
  return {
    academics: {
      semester: 'Fall 2026',
      subjects: [
        {
          id: 's-ai', name: 'AI Applications', professor: 'Prof. Adeyemi',
          deadlines: [
            { id: 'd1', title: 'Case Analysis 2', type: 'Assignment', date: '2026-10-21', time: '23:59', status: 'In progress' },
            { id: 'd2', title: 'Quiz 1', type: 'Quiz', date: '2026-10-22', time: '09:00', status: 'Not started' },
            { id: 'd3', title: 'Project Proposal', type: 'Project', date: '2026-10-24', time: '17:00', status: 'Not started' },
            { id: 'd4', title: 'Already handed in', type: 'Assignment', date: '2026-10-22', time: '', status: 'Done' },
          ],
          todos: [{ id: 't1', text: 'Read the case', done: false }],
          milestones: [{ id: 'm1', title: 'Final Project', date: '2026-12-08', done: false }],
          schedule: [
            { id: 'c1', title: 'Lecture', days: [2, 4], start: '08:40', end: '09:55', location: 'Room 120', from: '', until: '' },
            { id: 'c2', title: 'Old section', days: [4], start: '07:00', end: '08:00', location: 'Room 1', from: '', until: '2026-10-01' },
            { id: 'c3', title: 'Starts later', days: [4], start: '07:30', end: '08:30', location: 'Room 2', from: '2026-11-01', until: '' },
          ],
        },
        {
          id: 's-ts', name: 'Technology Strategy', professor: '',
          deadlines: [{ id: 'd5', title: 'Reading response 2', type: 'Reading', date: '2026-10-20', time: '', status: 'Not started' }],
          todos: [], milestones: [],
          schedule: [
            { id: 'c4', title: 'Lecture', days: [2, 4], start: '14:00', end: '15:15', location: 'Room 310', from: '', until: '' },
            { id: 'c5', title: 'Lab', days: [5], start: '13:00', end: '14:00', location: 'Lab 5', from: '', until: '' },
          ],
        },
        { id: 's-is', name: 'Independent Study', professor: '', deadlines: [], todos: [], milestones: [] },   // an older subject with no schedule key
      ],
    },
    lifeadmin: {
      documents: [
        { id: 'doc1', name: 'OPT application', deadline: '2026-10-23', status: 'In Progress', link: '', notes: '' },
        { id: 'doc2', name: 'Health waiver', deadline: '2026-10-22', status: 'Complete', link: '', notes: '' },
      ],
      home: [], groceries: [],
      bills: [
        { id: 'b1', name: 'Rent', amount: 1450, due: '2026-10-20', paid: false, recur: 'monthly' },
        { id: 'b2', name: 'Electricity', amount: 64.5, due: '2026-10-22', paid: false, recur: 'monthly' },
        { id: 'b3', name: 'Wi-Fi', amount: 50, due: '2026-10-25', paid: false, recur: 'monthly' },
        { id: 'b4', name: 'Phone', amount: 35, due: '2026-10-28', paid: false, recur: 'monthly' },
        { id: 'b5', name: 'Spotify', amount: 11, due: '2026-10-22', paid: true, recur: 'monthly' },
      ],
      appointments: [{ id: 'ap1', title: 'Dentist', date: '2026-10-22', time: '10:00', done: false }],
    },
    career: {
      applications: [
        { id: 'a1', company: 'Google', role: 'APM Intern', deadline: '2026-10-22', status: 'Preparing' },
        { id: 'a2', company: 'Meridian Capital', role: 'Summer Analyst', deadline: '2026-10-18', status: 'Interested' },
        { id: 'a3', company: 'Cornell Tech Studio', role: 'Fellow', deadline: '2026-10-17', status: 'Applied' },
        { id: 'a4', company: 'Databricks', role: 'APM', deadline: '2026-10-15', status: 'Waiting' },
        { id: 'a5', company: 'Northwind Labs', role: 'PM Intern', deadline: '2026-10-20', status: 'Waiting' },
        { id: 'a6', company: 'Bridgewater', role: 'Associate', deadline: '', status: 'Waiting' },
        { id: 'a7', company: 'Rivet', role: 'PM', deadline: '2026-10-10', status: 'Offer' },
      ],
      tasks: [], networking: [],
    },
    people: [
      { id: 'p1', name: 'Ricardo Puga', org: 'Cornell', role: 'Professor', how: '', last: '', next: '2026-10-21', notes: '', tasks: [] },
      { id: 'p2', name: 'Anika Rao', org: 'Meridian', role: 'Associate', how: '', last: '', next: '2026-10-22', notes: '', tasks: [] },
      { id: 'p3', name: 'James Whitfield', org: 'Northwind', role: 'Recruiter', how: '', last: '', next: '2026-10-27', notes: '', tasks: [] },
      { id: 'p4', name: 'Priya Menon', org: '', role: '', how: '', last: '', next: '', notes: '', tasks: [] },
    ],
    personal: {
      recreation: [
        { id: 'r1', text: 'Gym', done: false, date: '2026-10-22', time: '19:00' },
        { id: 'r2', text: 'Played already', done: true, date: '2026-10-22', time: '' },
      ],
      social: [{ id: 's1', text: 'Coffee with Priya', done: false, date: '2026-10-23', time: '09:30' }],
      tasks: [],
    },
  };
}

const emptyWorkspace = () => ({
  academics: { semester: 'Fall 2026', subjects: [] },
  lifeadmin: { documents: [], home: [], groceries: [], bills: [], appointments: [] },
  career: { applications: [], tasks: [], networking: [] },
  people: [],
  personal: { recreation: [], social: [], tasks: [] },
});

module.exports = { TODAY, sampleWorkspace, emptyWorkspace };
