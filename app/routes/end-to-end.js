const router = require('express').Router()
const { DateTime } = require('luxon')
const buildCyaSections = require('../data/cya/build-cya-sections')

router.post('/idt-filter', (req, res) => {
  const { data } = req.session
  // As long as they have picked at least 2 documents send them to OIDV
  if (data.haveDocuments?.length > 1) {
    return res.redirect('https://prototype-dth.herokuapp.com/auth/dev-ready/register/start?service-name=access-to-work-oidv')
  }
  return res.redirect('third-party')
})

router.post('/date-of-birth', (req, res, next) => {
  const { data } = req.session
  const sixteenYearsAgo = DateTime.now().minus({ years: 16 })
  const dateOfBirth = `${data['carerDateOfBirth-day']} ${data['carerDateOfBirth-month']} ${data['carerDateOfBirth-year']}`
  const parsedDateOfBirth = DateTime.fromFormat(dateOfBirth, 'd M yyyy')
  // If they're older than 16 continue on with journey
  if (parsedDateOfBirth < sixteenYearsAgo) {
    return res.redirect('country')
  }
  // If they're younger than 16 show ineligible
  return res.redirect('date-of-birth-ineligible')
})

router.post('/country', (req, res, next) => {
  const { data } = req.session
  if (data['elig--country'] === 'Another country') {
    return res.redirect('country-eea')
  }
  if (data['elig--country'] === 'Northern Ireland') {
    return res.redirect('ni')
  }
  if (data['elig--country'] === 'Scotland') {
    return res.redirect('Scotland')
  }
  return res.redirect('dp-name')
})


router.post('/qb-startdate', (req, res, _next) => {
  const { data } = req.session

  const dateFormat = 'd M yyyy' // e.g. 01 02 2022 or 5 11 2020

  const dateCaringDay = data['providing-care-day']
  const dateCaringMonth = data['providing-care-month']
  const dateCaringYear = data['providing-care-year']
  const dateStartedCaring = DateTime.fromFormat(`${dateCaringDay} ${dateCaringMonth} ${dateCaringYear}`, dateFormat)

  // Qualifying benefit start date
  const qbStartDay = data['qb-start-day']
  const qbStartMonth = data['qb-start-month']
  const qbStartYear = data['qb-start-year']
  const qbStartCaring = DateTime.fromFormat(`${qbStartDay} ${qbStartMonth} ${qbStartYear}`, dateFormat)

  // Date three months ago
  const threeMonthsAgo = DateTime.now().minus({ months: 3 })

  // Is the date started caring before three months ago?
  if (dateStartedCaring < threeMonthsAgo) {
    // Has a qb start date been provided?
    if (qbStartCaring.invalid !== null) {
      // Manual entry page
      return res.redirect('claimdate-3')
    }

    // Did the qb start longer than three months ago?
    if (qbStartCaring < threeMonthsAgo) {
      // Send to page to ask if benefit was awarded in last 3 months
      return res.redirect('qb-3months')
    }
    // If qb started in last three months we can make confident recommendation
    return res.redirect('claimdate-1')
  }

  // Date started caring must be in last three months at this point
  // Has a qb start date been provided?
  if (qbStartCaring.invalid !== null) {
    // We can make an uncertain recommendation due to care start being in the last three months
    return res.redirect('claimdate-2')
  } else {
    return res.redirect('claimdate-1')
  }
})

router.post('/qb-3months', (req, res, _next) => {
  const { data } = req.session

  // Was QB awarded in the last 3 months?
  const qbAwardedLastThreeMonths = data['qb-awarded-last-three-months']

  if (qbAwardedLastThreeMonths === 'Not sure') {
    // We can make an uncertain recommendation due to care start being in the last three months
    return res.redirect('claimdate-3')
  } else {
    return res.redirect('claimdate-1')
  }
})

// Custom route for claimdate-1 as gives user the option to accept recommended claim date which then needs to be written to session data
router.post('/claimdate-1', (req, res, _next) => {
  const { data } = req.session

  // If they accept the recommended claim date, save it to the data
  if (data?.acceptRecommendedClaimDate === 'Yes' && data?.recommendedClaimDate) {
    const dateFormat = 'd MMMM yyyy'
    const { recommendedClaimDate } = data
    const parsedRecommendedDate = DateTime.fromFormat(recommendedClaimDate, dateFormat)
    data['carerClaimStart-day'] = parsedRecommendedDate.day
    data['carerClaimStart-month'] = parsedRecommendedDate.month
    data['carerClaimStart-year'] = parsedRecommendedDate.year
    return res.redirect('national-insurance-number')
  }

  return res.redirect('claim-date-custom')
})

router.post('/care-you-provide-their-personal-details', (req, res, _next) => {
  const { data } = req.session

  if (data?.liveAtSameAddress === 'No') {
    return res.redirect('care-you-provide-postcode-lookup')
  }

  return res.redirect('dp-national-insurance-number')
})

router.post('/dp-national-insurance-number', (req, res, _next) => {
  const { data } = req.session

  if (data?.isDpPartner === 'Yes') {
    return res.redirect('any-breaks-in-care')
  }

  return res.redirect('your-partner-personal-details')
})

const getNextIncomeRoute = (req, res, _next) => {
  const currentWaypoint = req.path.replace('/', '')

  const valueToWaypoint = {
    StatutorySickPay: 'statutory-sick-pay',
    MaternityPaternity: 'maternity-paternity-adoption',
    Fostering: 'fostering-allowance',
    DirectPayment: 'direct-payment',
    Rental: 'rental-income',
    None: 'other-income'
  }

  const { data: { additionalIncomeTypes } } = req.session

  if (currentWaypoint === 'additional-income-types') {
    return res.redirect(valueToWaypoint[additionalIncomeTypes[0]])
  }

  const currentPageValue = Object.keys(valueToWaypoint).find(key => valueToWaypoint[key] === currentWaypoint)
  const currentPagePosition = additionalIncomeTypes.indexOf(currentPageValue)
  const positionOfNextPage = currentPagePosition + 1

  if (additionalIncomeTypes[positionOfNextPage]) {
    return res.redirect(valueToWaypoint[additionalIncomeTypes[positionOfNextPage]])
  } else {
    return res.redirect('other-income')
  }
}

router.post('/additional-income-types', getNextIncomeRoute)
router.post('/statutory-sick-pay', getNextIncomeRoute)
router.post('/maternity-paternity-adoption', getNextIncomeRoute)
router.post('/fostering-allowance', getNextIncomeRoute)
router.post('/direct-payment', getNextIncomeRoute)
router.post('/rental-income', getNextIncomeRoute)

const hasIncomeSource = (data) => {
  return data.employeeSince === 'Yes' ||
   data.selfEmployedSince === 'Yes' ||
   (data.otherIncomeSince?.length > 0 && !data.otherIncomeSince?.includes('None')) ||
   data.otherIncome === 'Yes'
}

router.post('/other-income', (req, res) => {
  const { data } = req.session
  if (data.otherIncome === 'Yes') {
    return res.redirect('other-income-details')
  }
  if (hasIncomeSource(data)) {
    return res.redirect('personal-pension')
  }
  return res.redirect('pay-details')
})

router.post('/other-income-details', (req, res) => {
  const { data } = req.session
  if (hasIncomeSource(data)) {
    return res.redirect('personal-pension')
  }
  return res.redirect('pay-details')
})

router.post('/employment', (req, res) => {
  const { data } = req.session
  if (data.employeeSince !== 'Yes') {
    return res.redirect('self-employment')
  }
  // Existing employments so redirect to summary page
  if (data.employmentStore && Object.keys(data.employmentStore).length > 0) {
    return res.redirect('employment-summary')
  }
  return res.redirect('employment-details')
})

router.post('/employment-remove-confirm', (req, res) => {
  const { data } = req.session

  if (data.selectedEmployment) {
    delete data.employmentStore[data.selectedEmployment]
  }
  return res.redirect('employment-summary')
})

router.get('/breaks-summary', (req, res, next) => {
  const { data } = req.session
  if (data.selectedBreak) {
    delete data.selectedBreak
  }
  next()
})

router.post('/break-remove-confirm', (req, res) => {
  const { data } = req.session

  if (data.selectedBreak) {
    delete data.breakStore[data.selectedBreak]
  }
  return res.redirect('breaks-summary')
})

router.post('/medical-break', (req, res) => {
  const { data } = req.session

  if (data.selectedBreak) {
    if (data.breakStore[data.selectedBreak].medicalBreak === 'Yes') {
      return res.redirect('hospital-stay')
    }
  }
  return res.redirect('breaks-summary')
})

router.get('/check-your-answers', (req, res, next) => {
  console.log(req.session?.data)
  res.locals.sections = buildCyaSections(req.session?.data)
  next()
})

module.exports = router
