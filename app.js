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
	//console.log("Connected..");*/
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
function updateTransactionStatusToReady(finisher,transactionId,apikey,amount,payeremail)
{
	var sql = `UPDATE transactions SET amount = ${amount} , payeremail = "${payeremail}" , status=2 WHERE transactionId = "${transactionId}" AND apikey="${apikey}" AND status=1`;
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

app.post('/makePayment',function(req,res){
	sendTransaction(function(sendTezResponse){
		console.log(sendTezResponse);
	},req.body.publicKey,req.body.privateKey,req.body.publicKeyHash,req.body.amount);
})

app.get('/pay',function(req,res){
	//console.log(req.query.transactionId);
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
											res.redirect(urlResponse.url+'?transactionId='+tnxId+'?status=success');
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
app.listen(PORT , () => console.log('Server Running'));	