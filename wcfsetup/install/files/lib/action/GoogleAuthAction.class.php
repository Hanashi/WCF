<?php
namespace wcf\action;
use ParagonIE\ConstantTime\Hex;
use wcf\data\user\User;
use wcf\data\user\UserEditor;
use wcf\system\exception\IllegalLinkException;
use wcf\system\exception\NamedUserException;
use wcf\system\exception\SystemException;
use wcf\system\request\LinkHandler;
use wcf\system\user\authentication\UserAuthenticationFactory;
use wcf\system\WCF;
use wcf\util\HeaderUtil;
use wcf\util\HTTPRequest;
use wcf\util\JSON;
use wcf\util\StringUtil;

/**
 * Handles google auth.
 * 
 * @author	Tim Duesterhus
 * @copyright	2001-2019 WoltLab GmbH
 * @license	GNU Lesser General Public License <http://opensource.org/licenses/lgpl-license.php>
 * @package	WoltLabSuite\Core\Action
 */
class GoogleAuthAction extends AbstractAction {
	/**
	 * @inheritDoc
	 */
	public $neededModules = ['GOOGLE_PUBLIC_KEY', 'GOOGLE_PRIVATE_KEY'];
	
	/**
	 * @inheritDoc
	 */
	public function readParameters() {
		parent::readParameters();
		
		if (WCF::getSession()->spiderID) {
			throw new IllegalLinkException();
		}
	}
	
	/**
	 * @inheritDoc
	 */
	public function execute() {
		parent::execute();
		
		$callbackURL = LinkHandler::getInstance()->getLink('GoogleAuth');
		// user accepted the connection
		if (isset($_GET['code'])) {
			try {
				// fetch access_token
				$request = new HTTPRequest('https://accounts.google.com/o/oauth2/token', [], [
					'code' => $_GET['code'],
					'client_id' => StringUtil::trim(GOOGLE_PUBLIC_KEY),
					'client_secret' => StringUtil::trim(GOOGLE_PRIVATE_KEY),
					'redirect_uri' => $callbackURL,
					'grant_type' => 'authorization_code'
				]);
				$request->execute();
				$reply = $request->getReply();
				
				$content = $reply['body'];
			}
			catch (SystemException $e) {
				\wcf\functions\exception\logThrowable($e);
				throw new IllegalLinkException();
			}
			
			// validate state, validation of state is executed after fetching the access_token to invalidate 'code'
			if (!isset($_GET['state']) || !WCF::getSession()->getVar('__googleInit') || !\hash_equals(WCF::getSession()->getVar('__googleInit'), $_GET['state'])) throw new IllegalLinkException();
			WCF::getSession()->unregister('__googleInit');
			
			$data = JSON::decode($content);
			
			try {
				// fetch openID connect configuration
				$request = new HTTPRequest('https://accounts.google.com/.well-known/openid-configuration');
				$request->execute();
				$reply = $request->getReply();
				$content = JSON::decode($reply['body']);
				
				// fetch userdata
				$request = new HTTPRequest($content['userinfo_endpoint']);
				$request->addHeader('Authorization', 'Bearer '.$data['access_token']);
				$request->execute();
				$reply = $request->getReply();
				
				$content = $reply['body'];
			}
			catch (SystemException $e) {
				\wcf\functions\exception\logThrowable($e);
				throw new IllegalLinkException();
			}
			
			$userData = JSON::decode($content);
			
			// check whether a user is connected to this google account
			$user = User::getUserByAuthData('google:'.$userData['sub']);
			
			if ($user->userID) {
				// a user is already connected, but we are logged in, break
				if (WCF::getUser()->userID) {
					throw new NamedUserException(WCF::getLanguage()->getDynamicVariable('wcf.user.3rdparty.google.connect.error.inuse'));
				}
				// perform login
				else {
					WCF::getSession()->changeUser($user);
					WCF::getSession()->update();
					HeaderUtil::redirect(LinkHandler::getInstance()->getLink());
				}
			}
			else {
				WCF::getSession()->register('__3rdPartyProvider', 'google');
				
				// save data for connection
				if (WCF::getUser()->userID) {
					WCF::getSession()->register('__googleUsername', $userData['name']);
					WCF::getSession()->register('__googleData', $userData);
					
					HeaderUtil::redirect(LinkHandler::getInstance()->getLink('AccountManagement').'#3rdParty');
				}
				// save data and redirect to registration
				else {
					WCF::getSession()->register('__username', $userData['name']);
					if (isset($userData['email'])) {
						WCF::getSession()->register('__email', $userData['email']);
					}
					
					WCF::getSession()->register('__googleData', $userData);
					
					// we assume that bots won't register on google first
					// thus no need for a captcha
					if (REGISTER_USE_CAPTCHA) {
						WCF::getSession()->register('noRegistrationCaptcha', true);
					}
					
					WCF::getSession()->update();
					HeaderUtil::redirect(LinkHandler::getInstance()->getLink('Register'));
				}
			}
			
			$this->executed();
			exit;
		}
		// user declined or any other error that may occur
		if (isset($_GET['error'])) {
			throw new NamedUserException(WCF::getLanguage()->getDynamicVariable('wcf.user.3rdparty.google.login.error.'.$_GET['error']));
		}
		
		// start auth by redirecting to google
		$token = Hex::encode(\random_bytes(20));
		WCF::getSession()->register('__googleInit', $token);
		HeaderUtil::redirect("https://accounts.google.com/o/oauth2/auth?client_id=".rawurlencode(StringUtil::trim(GOOGLE_PUBLIC_KEY)). "&redirect_uri=".rawurlencode($callbackURL)."&state=".$token."&scope=profile+openid+email&response_type=code");
		$this->executed();
		exit;
	}
}
