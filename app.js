const express = require('express');
const app = express();
const exphbs  = require('express-handlebars');
const path = require('path');
const request = require('request');
const bodyParser = require('body-parser');
var expressSession = require('express-session');
var cookieParser = require('cookie-parser');
var mysql = require('mysql');
var md5 = require('md5');
var sha256 = require('sha256');
const nodemailer = require('nodemailer');
const conseiljs = require('conseiljs');
const tezosNode = 'https://tezos-dev.cryptonomic-infra.tech';
conseiljs.setLogLevel('debug');
const rp = require('request-promise');
const PORT = process.env.PORT || 5003;

var con = mysql.createConnection({
	host : "localhost",
	user : "root",
	password : "",
	database : "gateway",
})

app.use(bodyParser.urlencoded({extended:false}));

app.use(express.static(path.join(__dirname, 'public')));
app.engine('handlebars', exphbs());
app.set('view engine', 'handlebars');
app.use(cookieParser());
app.use(expressSession({
    secret: 'mYsEcReTkEy',
    resave: true,
    saveUninitialized: true
}));// I haven't used the session store
con.connect();

//setting session
function mailsender(finisher,body,to,subject)
{
	let transporter = nodemailer.createTransport({
host: 'smtp.gmail.com',
port: 587,
secure: false,
requireTLS: true,
auth: {
    user: 'pawan.itlion@gmail.com', // like : abc@gmail.com
    pass: 'pawan.itlion'           // like : pass@123
}
});

let mailOptions = {
 from: 'no-reply@payelixir.co.in',
 to: to,
 subject: subject,
 text: body
};

transporter.sendMail(mailOptions, (error, info) => {
  if (error) {
  	finisher(0)
	console.log(error);     
  }
  else
  {
  	finisher(1);
  }

});
}

function INRtoXTZ(finisher,amount)
{
	const requestOptions = {
  	method: 'GET',
  	uri: 'https://pro-api.coinmarketcap.com/v1/cryptocurrency/listings/latest',
  	qs: {
  	
    'start': '10',
    'limit': '1',
    'convert': 'INR'
  },
  headers: {
    'X-CMC_PRO_API_KEY': '81d5f296-e8dc-4ae2-8633-4a7b6d0a0ff1'
  },
  json: true,
  gzip: true
	};

	rp(requestOptions).then(response => {
  	console.log('API call response:', response);
  	console.log(response.data[0].quote);
  	console.log(response.data[0].quote.INR.price);
  	let convertedXTZ = Math.ceil ((amount / response.data[0].quote.INR.price) * 1000000);
  	finisher(convertedXTZ);
	}).catch((err) => {
  	console.log('API call error:', err.message);
  	finisher(0);
	});
}
function getRandomArbitrary(min, max) {
  return Math.random() * (max - min) + min;
}
function clearRPCOperationGroupHash(ids) {
    return ids.replace(/\"/g, '').replace(/\n/, '');
}
async function sendTransaction(finisher,publickey,privateKey,publicKeyHash,amount) {
	let conseilServer = { 'url': 'https://conseil-dev.cryptonomic-infra.tech:443', 'apiKey': '4e3328e0-8598-4e70-a43e-286d9be8253c', 'network': 'carthagenet' };
    const keystore = {
        publicKey: publickey,
        privateKey: privateKey,
        publicKeyHash: publicKeyHash,
        seed: '',
        storeType: conseiljs.StoreType.Fundraiser
    };

    const result = await conseiljs.TezosNodeWriter.sendTransactionOperation(tezosNode, keystore, 'tz1av5EQQdScqTDvJGkhz9KHPyWX8D8RRxM9', amount, 1500, '');
    console.log(result);
    console.log(result.results.contents);
    console.log(`Injected operation group id ${result.operationGroupID}`);
    const groupid = clearRPCOperationGroupHash(result.operationGroupID);
    console.log(groupid);	
    const conseilResult = await conseiljs.TezosConseilClient.awaitOperationConfirmation(conseilServer, conseilServer.network, groupid, 5, 30+1);
    console.log(conseilResult);
    if(conseilResult.status === 'applied')
    {
    	let onChainOperationResult = {'isSuccessfull' : true , 'operationId' : groupid};
    	finisher(onChainOperationResult);
    }
    else
    {
    	let onChainOperationResult = {'isSuccessfull' : false , 'operationId' : groupid};
    	finisher(onChainOperationResult);	
    }	
}

function authenticate(finisher,username,apikey) {
		var sql= `SELECT id FROM clients  WHERE username="${username}" AND apikey = "${apikey}"`;
		con.query(sql,function(err,res,fields){
			//console.log(res);
			finisher(res.length);
		});
}
function validatePaymentAndGetAmount(finisher,transactionId)
{
	var sql = `SELECT amount, username FROM transactions WHERE transactionId = "${transactionId}" AND status = 2`;
	con.query(sql,function(err,res,fields){
		if(err)
		{
			let amountResponse = {'isValid' : false , 'amount' : 0 , 'username' : ''};
			finisher(amountResponse);
		}
		else
		{
			if(res.length === 1)
			{
				let amountResponse = {'isValid' : true , 'amount' : res[0].amount , 'username' : res[0].username};
				finisher(amountResponse);
			}
			else
			{
				let amountResponse = {'isValid' : false , 'amount' : 0 , 'username' : ''};
				finisher(amountResponse);
			}
		}
	});
}
function getRedirectorURL(finisher , username)
{
	var sql = `SELECT redirecturl FROM clients WHERE username = "${username}"`;
	con.query(sql,function(err,res,fields){
		if(err)
		{
			let urlResponse = {'redirect' : false,'url' : ''};
			finisher(urlResponse);
		}
		else
		{
			let urlResponse = {'redirect' : true,'url' : res[0].redirecturl};
			finisher(urlResponse);
		}
	})
}
function addTransaction(finisher,transactionId,username,apikey)
{
	var sql = `INSERT INTO transactions (transactionId,username,apikey) VALUES ("${transactionId}","${username}","${apikey}");`;
	con.query(sql,function(err,res,fields){
		if(err)
		{
			finisher(err);
		}
		else
		{
			finisher(res);
		}
	});
}
function signupUtil(finisher,username,password)
{
	var sqlSelect = `SELECT id FROM clients WHERE username = "${username}"`;
	console.log(sqlSelect);
	con.query(sqlSelect,function(err,res,fields){
		if(err)
		{
			console.log(err);
			let signupResponse = {'isSuccessfull' : false , reason : 'Server Error'};
			finisher(signupResponse);
		}
		else
		{
			if(res.length === 1)
			{
				let signupResponse = {'isSuccessfull' : false , reason : 'username already exists'};
				finisher(signupResponse);
			}
			else
			{
				let apikey = sha256(username + Date.now() + getRandomArbitrary(1,100000));
				console.log(apikey);
				
				var sqlInsert = `INSERT INTO clients (username,password,apikey) VALUES ("${username}","${md5(password)}","${apikey}")`;
				console.log(sqlInsert);
				con.query(sqlInsert,function(err,res,fields){
					if(err)
					{
						console.log(err);
						let signupResponse = {'isSuccessfull' : false , reason : 'Server error'};
						finisher(signupResponse); 
					}
					else
					{
						let signupResponse = {'isSuccessfull' : true , reason : ''};
						finisher(signupResponse);
					}
				});
			}
		}
	});
}
function loginUtil(finisher,username,password)
{
	var sql = `SELECT id FROM clients WHERE username = "${username}" AND password = "${password}"`;
	con.query(sql,function(err,res,fields){
		if(err)
		{
			let loginResponse = {'isPresent' : false, 'reason' : 'Server Error'};
			finisher(loginResponse);
		}
		else
		{
			if(res.length === 1)
			{
				let loginResponse = {'isPresent' : true , 'reason' : ''};
				finisher(loginResponse);
			}
			else
			{
				let loginResponse = {'isPresent' : false , 'reason' : 'Authentication Failed'};
				finisher(loginResponse);
			}
		}
	});
}

function dashboardUtil(finisher,username)
{
	var sql = `SELECT apikey,redirecturl FROM clients WHERE username = "${username}"`;
	con.query(sql,function(err,res,fields){
		if(err)
		{
			let dashboardResponse ={'apikey' : '503 Error' , 'url' : '503 Error'};
			finisher(dashboardResponse);
		}
		else
		{
			if(res.length === 1)
			{
				let dashboardResponse ={'apikey' : res[0].apikey , 'url' : res[0].redirecturl};
				finisher(dashboardResponse);
			}
			else
			{
				let dashboardResponse ={'apikey' : '404 Error' , 'url' : '404 Error'};
				finisher(dashboardResponse);
			}
		}
	});
}
function updateTransactionStatusToReady(finisher,transactionId,apikey,amount,payeremail)
{
	var sql = `UPDATE transactions SET amount = ${amount} , payeremail = "${payeremail}" , status=2 WHERE transactionId = "${transactionId}" AND apikey="${apikey}" AND status=1`;
	
	con.query(sql,function(err,res,fields){
		if(err)
		{
			finisher(err);
		}
		else
		{
			finisher(res);
		}
	});
}

function changeKeyUtil(finisher,username,apikey)
{
	var sql = `UPDATE clients SET apiKey = "${apikey}" WHERE username="${username}"`;
	con.query(sql,function(err,res,fields){
		if(err)
		{
			finisher('')
		}
		else
		{
			finisher('');
		}
	});
}

function updateLanderURLUtil(finisher,username,url)
{
	var sql = `UPDATE clients SET redirecturl = "${url}" WHERE username="${username}"`;
	con.query(sql,function(err,res,fields){
		if(err)
		{
			finisher('')
		}
		else
		{
			finisher('');
		}
	});	
}
function getTransactionsByUsername(finisher,username)
{
	var responses = [];
	var sql = `SELECT transactionId, amount, payeremail, status, paymentStatus FROM transactions WHERE username = "${username}" ORDER BY id DESC`;
	console.log(sql);
	con.query(sql,function(err,res,fields){
		if(err)
		{
			finisher(responses);
		}

		for(let i=0;i<res.length;i++)
		{
			if(res[i].status === 1)
			{
				res[i].status = "Pending";
			}
			else if(res[i].status === 2)
			{
				res[i].status = "Initiated";	
			}
			else if(res[i].status === 3)
			{
				res[i].status = "Complete";	
			}
			if(res[i].paymentStatus === 1)
			{
				res[i].paymentStatus = "Success";
			}
			else if(res[i].paymentStatus === 2)
			{
				res[i].paymentStatus = "Failed";
			}
			else
			{
				res[i].paymentStatus = "Pending";
			}
			let rowData = {'transactionId' : res[i].transactionId , 'amount' : res[i].amount , 'payeremail' : res[i].payeremail, 'status' : res[i].status, 'paymentStatus' : res[i].paymentStatus};
			responses.push(rowData);
		}
		finisher(responses);
	});
}
function updateTransactionStatusToComplete(finisher,transactionId,operationId,paymentStatus)
{
	var sql = `UPDATE transactions SET opID = "${operationId}" , paymentStatus = ${paymentStatus} , status=3 WHERE transactionId = "${transactionId}" AND status=2`;
	console.log(sql);
	con.query(sql,function(err,res,fields){
		if(err)
		{
			finisher(err);
		}
		else
		{
			finisher(res);
		}
	});
}
function checkTransactionStatusUtil(finisher,apikey,transactionId)
{
	var sql = `SELECT status,paymentStatus FROM transactions WHERE apikey="${apikey}" AND transactionId="${transactionId}"`;
	console.log(sql);
	con.query(sql,function(err,res,fields){
		if(err)
		{
			let transactionStatusResponse = {'status':'NA' , 'paymentStatus':'NA'};
			finisher(transactionStatusResponse);
		}
		else
		{
			if(res.length === 1)
			{
				if(res[0].status === 1)
				{
					res[0].status = "Pending";
				}
				else if(res[0].status === 2)
				{
					res[0].status = "Initiated";	
				}
				else if(res[0].status === 3)
				{
					res[0].status = "Complete";	
				}
				if(res[0].paymentStatus === 1)
				{
					res[0].paymentStatus = "Success";
				}
				else if(res[0].paymentStatus === 2)
				{
					res[0].paymentStatus = "Failed";
				}
				else
				{
					res[0].paymentStatus = "Pending";
				}
				let transactionStatusResponse = {'status':res[0].status , 'paymentStatus':res[0].paymentStatus};
				finisher(transactionStatusResponse);
			}
			else
			{
				let transactionStatusResponse = {'status':'NA' , 'paymentStatus':'NA'};
				finisher(transactionStatusResponse);
			}
		}
	});
}
app.post('/requestTransactionId',function(req,res){
	authenticate(function(dbres){
		if(dbres===1)
		{
			let transactionKeyString = req.body.username + Date.now() + getRandomArbitrary(1,100000);
			console.log(transactionKeyString);
			let transactionId = md5(transactionKeyString);
			console.log(transactionId);
			addTransaction(function(lres)
			{
				if(lres.affectedRows===1)
				{
					let responseJSON = {'status' : 'success' , 'transactionsId' : transactionId , 'code' : '200'};
					res.json(responseJSON);
				}
				else
				{
					let responseJSON = {'status' : 'failure' , 'transactionsId' : '' , 'code' : '503'};
					res.json(responseJSON);
				}
			},transactionId,req.body.username,req.body.apikey);
		}
		else
		{
			let responseJSON = {'status' : 'failure' , 'transactionsId' : '' , 'code' : '401'};
			res.json(responseJSON);
		}
	},req.body.username,req.body.apikey)
	
});
app.post('/initiateTransaction',function(req,res){
	updateTransactionStatusToReady(function(updateResponse){
		if(updateResponse.affectedRows ===1)
		{
			let responseJSON = {'status' : 'success'};
			res.json(responseJSON);
		}
		else
		{
			let responseJSON = {'status' : 'failed'};
			res.json(responseJSON);
		}
	},req.body.transactionId,req.body.apikey,req.body.amount,req.body.payeremail);
})

app.get('/changeAPIKey',function(req,res){
	if(req.session.username)
	{
		let apikey = sha256(req.session.username + Date.now() + getRandomArbitrary(1,100000));
		changeKeyUtil(function(changeKeyResponse){
			res.redirect('/dashboard');
		},req.session.username, apikey);
	}
	else
	{
		res.redirect('/');
	}
});
app.get('/pay',function(req,res){
	if(req.query.transactionId)
	{
		req.session.transactionId = req.query.transactionId;
		console.log(req.session.transactionId);
		res.render('tezpayform');
	}
	else
	{
		res.status(403).send('Error');
	}
});


app.get('/paylink',function(req,res){
	if(req.query.transactionId)
	{
		req.session.transactionId = req.query.transactionId;
		console.log(req.session.transactionId);
		res.render('tezpaylinkform');
	}
	else
	{
		res.status(403).send('Error');
	}
});

app.get('/',function(req,res){
	res.render('index');
});

app.post('/updateLanderURL',function(req,res){
	console.log(req.body.url);
	if(req.session.username)
	{
		updateLanderURLUtil(function(updateResponse){
			res.redirect('/dashboard');
		},req.session.username,  req.body.url);
	}
	else
	{
		res.redirect('/');
	}
})

app.get('/documentation',function(req,res){
	if(req.session.username)
	{
		res.render('documentation');
	}
	else
	{
		res.redirect('/');
	}
});

app.get('/transactions',function(req,res){
	if(req.session.username)
	{
		getTransactionsByUsername(function(transactionsResponse){
			console.log(transactionsResponse);
			res.render('transactions',{
				'transactions' : transactionsResponse,
			});
		},req.session.username);
	}
	else
	{
		res.redirect('/');
	}
});

app.get('/logout',function(req,res){
	delete req.session.username;
	res.redirect('/');
});

app.get('/dashboard',function(req,res){
	if(req.session.username)
	{
		dashboardUtil(function(dashboardResponse){
			res.render('dashboard',{
				'apikey':dashboardResponse.apikey,
				'landerurl':dashboardResponse.url,
			})
		},req.session.username);
	}
	else
	{
		res.redirect('/');
	}
});

app.get('/paymentLinks',function(req,res){
	if(req.session.username)
	{
		res.render('PaymentLinks');
	}
	else
	{
		res.redirect('/');
	}
});

app.post('/generatePaymentLink',function(req,res){
	if(!req.session.username)
	{
		res.redirect('/');
	}
	authenticate(function(dbres){
		if(dbres===1)
		{
			let transactionKeyString = req.session.username + Date.now() + getRandomArbitrary(1,100000);
			console.log(transactionKeyString);
			let transactionId = md5(transactionKeyString);
			console.log(transactionId);
			addTransaction(function(lres)
			{
				if(lres.affectedRows===1)
				{
					updateTransactionStatusToReady(function(updateResponse){
						if(updateResponse.affectedRows === 1)
						{
							let bodyMail = "A new payment request has been generated. Please pay using this link http://localhost:5003/paylink?transactionId="+transactionId;
							let toMail = req.body.payeremail;
							let subjectMail = "Tezway - payement request";
							mailsender(function(mailResponse){
								if(mailResponse===1)
								{
									res.render('PaymentLinks',{
										'paymentLinkResult' : 'Link sent to payer.',
									});		
								}
								else
								{
									res.render('PaymentLinks',{
										'paymentLinkResult' : 'Failed to send link',
									});	
								}
							},bodyMail,toMail,subjectMail);
									
						}
						else
						{
							res.render('PaymentLinks',{
								'paymentLinkResult' : 'Failed due to server error',
							});
						}
					},transactionId,req.body.apikey, req.body.amount,req.body.payeremail);
					//transactionId,apikey,amount,payeremail
				}
				else
				{
					res.render('PaymentLinks',{
						'paymentLinkResult' : 'Failed due to server error',
					});
				}
			},transactionId,req.session.username,req.body.apikey);
		}
		else
		{
			res.render('PaymentLinks',{
				'paymentLinkResult' : 'Failed due to server error',
			});
		}
	},req.session.username,req.body.apikey)
});

app.post('/login',function(req,res){
	loginUtil(function(loginResponse){
		if(loginResponse.isPresent)
		{
			req.session.username = req.body.email;
			res.redirect('/dashboard');
		}
		else
		{
			res.render('index',{
				'failReason' : loginResponse.reason,
			});
		}
	}, req.body.email , md5(req.body.password));
});

app.post('/signup',function(req,res){
	console.log(req.body.email, req.body.password , req.body.cpassword);
	if(req.body.password === req.body.cpassword);
	{
		signupUtil(function(signupResponse){
			if(signupResponse.isSuccessfull)
			{
				req.session.username = req.body.username;
				res.redirect('/dashboard');
			}
			else
			{
				res.render('index',{
					'reason' : signupResponse.reason,
				});
			}
		}, req.body.email, req.body.password);
	}
});

app.post('/checkTransactionStatus',function(req,res){
	checkTransactionStatusUtil(function(transactionStatusResponse){
		res.json(transactionStatusResponse)
	},req.body.apikey, req.body.transactionId);
});

app.post('/pay',function(req,res){
	if(req.session.transactionId)
	{
		validatePaymentAndGetAmount(function(amountResponse){
			if(amountResponse.isValid)
			{
				INRtoXTZ(function(conversionResponse){
					console.log(conversionResponse);
					/*let finalResponse = {'conversionResponse' : conversionResponse};
					res.json(finalResponse);*/
					if(conversionResponse > 0)
					{
						sendTransaction(function(onChainOperationResponse){
							if(onChainOperationResponse.isSuccessfull)
							{
								updateTransactionStatusToComplete(function(databaseUpdateResponse){
									console.log(databaseUpdateResponse);
									if(databaseUpdateResponse.affectedRows === 1)
									{
										let tnxId = req.session.transactionId;
										delete req.session.transactionId;
										getRedirectorURL(function(urlResponse){
											res.redirect(urlResponse.url+'?transactionId='+tnxId+'?status=success');
										},amountResponse.username);

									}
									else
									{
										res.status(503);
									}
								},req.session.transactionId,onChainOperationResponse.operationId,1);
							}
							else
							{
								updateTransactionStatusToComplete(function(databaseUpdateResponse){
									if(databaseUpdateResponse.affectedRows === 1)
									{
										let tnxId = req.session.transactionId;
										delete req.session.transactionId;
										getRedirectorURL(function(urlResponse){
											res.redirect(urlResponse.url+'?transactionId='+tnxId+'?status=failure');
										},amountResponse.username);
									}
									else
									{
										res.status(503);
									}
								},req.session.transactionId,onChainOperationResponse.operationId,2);
							}
						},req.body.publicKey, req.body.privateKey, req.body.publicKeyHash , conversionResponse);
					}
					else
					{
						res.status(503).send("Invalid Request");
						delete req.session.transactionId;
					}
				},amountResponse.amount);
			}
			else
			{
				res.status(403).send("Payment Closed");
				delete req.session.transactionId;
			}
		},req.session.transactionId);

	}
	else
	{
		res.status(403).send('Error');
		delete req.session.transactionId;
	}

});
/*test(function(res){
	console.log('Converted  Value' , res);
});*/

/*validatePaymentAndGetAmount(function(res){
	console.log(res);
	if(res.isValid)
	{
		console.log(res.amount);
	}
},"8107f55de63b3067ab78c46fb797712b");*/


app.post('/paylink',function(req,res){
	if(req.session.transactionId)
	{
		validatePaymentAndGetAmount(function(amountResponse){
			if(amountResponse.isValid)
			{
				INRtoXTZ(function(conversionResponse){
					console.log(conversionResponse);
					/*let finalResponse = {'conversionResponse' : conversionResponse};
					res.json(finalResponse);*/
					if(conversionResponse > 0)
					{
						sendTransaction(function(onChainOperationResponse){
							if(onChainOperationResponse.isSuccessfull)
							{
								updateTransactionStatusToComplete(function(databaseUpdateResponse){
									console.log(databaseUpdateResponse);
									if(databaseUpdateResponse.affectedRows === 1)
									{
										
										delete req.session.transactionId;
										res.status(200).send('Thank you for paying with Tezway');

									}
									else
									{
										res.status(503);
									}
								},req.session.transactionId,onChainOperationResponse.operationId,1);
							}
							else
							{
								updateTransactionStatusToComplete(function(databaseUpdateResponse){
									if(databaseUpdateResponse.affectedRows === 1)
									{
										
										delete req.session.transactionId;
										res.status(200).send('Thank you for paying with Tezway');
									}
									else
									{
										res.status(503);
									}
								},req.session.transactionId,onChainOperationResponse.operationId,2);
							}
						},req.body.publicKey, req.body.privateKey, req.body.publicKeyHash , conversionResponse);
					}
					else
					{
						res.status(503).send("Invalid Request");
						delete req.session.transactionId;
					}
				},amountResponse.amount);
			}
			else
			{
				res.status(403).send("Payment Closed");
				delete req.session.transactionId;
			}
		},req.session.transactionId);

	}
	else
	{
		res.status(403).send('Error');
		delete req.session.transactionId;
	}

});

app.listen(PORT , () => console.log('Server Running'));	
